import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage, ChatThread } from "../lib/types";

interface ChatRealtimeOptions {
  threadId: string | null;
  surface: "user" | "admin";
  onMessageCreated: (message: ChatMessage, clientMessageId?: string) => void;
  onThreadUpdated?: (thread: ChatThread) => void;
  onTypingUpdate?: (typers: Array<{ userId: string; senderRole: string }>) => void;
  onPresenceUpdate?: (participants: Array<{ userId: string; lastSeen: number }>) => void;
  onReadUpdate?: (readInfo: {
    threadId: string;
    readerRole: "user" | "admin";
    readerUserId: string;
    lastReadAt: string;
  }) => void;
}

export function useChatRealtime({
  threadId,
  surface,
  onMessageCreated,
  onThreadUpdated,
  onTypingUpdate,
  onPresenceUpdate,
  onReadUpdate,
}: ChatRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!threadId) return;

    if (esRef.current) {
      esRef.current.close();
    }

    const sseUrl = `/api/chat?threadId=${encodeURIComponent(threadId)}&stream=1&surface=${surface}`;
    const es = new EventSource(sseUrl);
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    es.onerror = (e) => {
      console.error("SSE Error:", e);
      setIsConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff could be added here, currently fixed 3s retry
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, 3000);
      }
    };

    es.addEventListener("message.created", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.payload?.message) {
          onMessageCreated(data.payload.message, data.payload.clientMessageId);
        }
      } catch (err) {
        console.error("Failed to parse message.created event", err);
      }
    });

    es.addEventListener("thread.updated", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.payload?.thread && onThreadUpdated) {
          onThreadUpdated(data.payload.thread);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener("typing.update", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.payload?.typers && onTypingUpdate) {
          onTypingUpdate(data.payload.typers);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener("presence.update", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.payload?.participants && onPresenceUpdate) {
          onPresenceUpdate(data.payload.participants);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    es.addEventListener("read.update", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.payload && onReadUpdate) {
          onReadUpdate(data.payload);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });
  }, [
    threadId,
    surface,
    onMessageCreated,
    onThreadUpdated,
    onTypingUpdate,
    onPresenceUpdate,
    onReadUpdate,
  ]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (esRef.current) {
        esRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
