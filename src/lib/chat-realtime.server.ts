import { cfEnv } from "./d1.server";
import type { ChatRealtimeEvent, TypingParticipant, PresenceParticipant } from "./types";

export type ChatEvent = ChatRealtimeEvent & {
  threadId: string;
  timestamp: string;
};

type Listener = (event: ChatEvent) => void;

class ChatRealtimeHub {
  private listeners: Map<string, Set<Listener>> = new Map();
  private typingMap: Map<string, Map<string, TypingParticipant & { expiresAt: number }>> =
    new Map();
  private presenceMap: Map<string, Map<string, PresenceParticipant>> = new Map();

  private getDO(threadId: string) {
    const env = cfEnv() as any;
    if (env && env.CHAT_REALTIME_DO) {
      const id = env.CHAT_REALTIME_DO.idFromName(threadId);
      return env.CHAT_REALTIME_DO.get(id);
    }
    return null;
  }

  async getStreamResponse(threadId: string, request: Request): Promise<Response | null> {
    const obj = this.getDO(threadId);
    if (obj) {
      return obj.fetch(
        new Request("http://do/subscribe", {
          method: "GET",
          headers: request.headers,
          signal: request.signal,
        }),
      );
    }
    return null;
  }

  /** Subscribe to events for a specific thread (Legacy memory fallback) */
  subscribe(threadId: string, listener: Listener): () => void {
    if (!this.listeners.has(threadId)) {
      this.listeners.set(threadId, new Set());
    }
    const set = this.listeners.get(threadId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(threadId);
      }
    };
  }

  /** Broadcast event to all subscribers of a thread */
  async broadcast(threadId: string, event: Omit<ChatEvent, "threadId" | "timestamp">) {
    const fullEvent = {
      ...event,
      threadId,
      timestamp: new Date().toISOString(),
    } as ChatEvent;

    const obj = this.getDO(threadId);
    if (obj) {
      await obj.fetch(
        new Request("http://do/broadcast", {
          method: "POST",
          body: JSON.stringify(fullEvent),
        }),
      );
      return;
    }

    const threadListeners = this.listeners.get(threadId);
    if (threadListeners) {
      for (const listener of threadListeners) {
        try {
          listener(fullEvent);
        } catch {
          // ignore subscriber error
        }
      }
    }
  }

  /** Set user typing status (expires in 4 seconds) */
  async setTyping(
    threadId: string,
    user: { id: string; name: string; role: "user" | "admin" },
    isTyping: boolean,
  ) {
    const obj = this.getDO(threadId);
    if (obj) {
      await obj.fetch(
        new Request("http://do/setTyping", {
          method: "POST",
          body: JSON.stringify({ user, isTyping }),
        }),
      );
      return;
    }

    if (!this.typingMap.has(threadId)) {
      this.typingMap.set(threadId, new Map());
    }
    const threadTyping = this.typingMap.get(threadId)!;

    if (isTyping) {
      threadTyping.set(user.id, {
        userId: user.id,
        userName: user.name,
        senderRole: user.role,
        expiresAt: Date.now() + 4000,
      });
    } else {
      threadTyping.delete(user.id);
    }

    this.cleanExpired(threadId);
    const activeTypers = Array.from(threadTyping.values()).map((t) => ({
      userId: t.userId,
      userName: t.userName,
      senderRole: t.senderRole,
    }));

    this.broadcast(threadId, {
      type: "typing.update",
      payload: { typers: activeTypers },
    });
  }

  /** Record presence heartbeat */
  async recordPresence(threadId: string, userId: string) {
    const obj = this.getDO(threadId);
    if (obj) {
      await obj.fetch(
        new Request("http://do/recordPresence", {
          method: "POST",
          body: JSON.stringify({ userId }),
        }),
      );
      return;
    }

    if (!this.presenceMap.has(threadId)) {
      this.presenceMap.set(threadId, new Map());
    }
    const threadPresence = this.presenceMap.get(threadId)!;
    threadPresence.set(userId, {
      userId,
      lastSeen: Date.now(),
    });
  }

  /** Get active typing users in a thread */
  async getActiveTypers(
    threadId: string,
  ): Promise<{ userId: string; userName: string; senderRole: "user" | "admin" }[]> {
    const obj = this.getDO(threadId);
    if (obj) {
      const res = await obj.fetch(new Request("http://do/getActiveTypers"));
      return await res.json();
    }

    this.cleanExpired(threadId);
    const threadTyping = this.typingMap.get(threadId);
    if (!threadTyping) return [];
    return Array.from(threadTyping.values()).map((t) => ({
      userId: t.userId,
      userName: t.userName,
      senderRole: t.senderRole,
    }));
  }

  /** Check if a user in a thread was seen recently (last 60s) */
  async isUserOnline(threadId: string, userId: string): Promise<boolean> {
    const obj = this.getDO(threadId);
    if (obj) {
      const res = await obj.fetch(new Request(`http://do/isUserOnline?userId=${userId}`));
      return await res.json();
    }

    const threadPresence = this.presenceMap.get(threadId);
    if (!threadPresence) return false;
    const p = threadPresence.get(userId);
    if (!p) return false;
    return Date.now() - p.lastSeen < 60_000;
  }

  private cleanExpired(threadId: string) {
    const now = Date.now();
    const threadTyping = this.typingMap.get(threadId);
    if (threadTyping) {
      for (const [uid, item] of threadTyping.entries()) {
        if (item.expiresAt < now) {
          threadTyping.delete(uid);
        }
      }
    }
  }
}

export const chatRealtime = new ChatRealtimeHub();
