import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage, Thread } from "../lib/types";

interface ChatRealtimeOptions {
  threadId: string | null;
  surface: "user" | "admin";
  onMessageCreated: (message: ChatMessage, clientMessageId?: string) => void;
  onThreadUpdated?: (thread: Thread) => void;
  onTypingUpdate?: (typers: Array<{ userId: string; senderRole: string }>) => void;
  onPresenceUpdate?: (participants: Array<{ userId: string; lastSeen: number }>) => void;
  onReadUpdate?: (readInfo: {
    threadId: string;
    readerRole: "user" | "admin";
    readerUserId: string;
    lastReadAt: string;
  }) => void;
  onQueueUpdated?: (metrics: any) => void;
}

export function useChatRealtime({
  threadId,
  surface,
  onMessageCreated,
  onThreadUpdated,
  onTypingUpdate,
  onPresenceUpdate,
  onReadUpdate,
  onQueueUpdated,
}: ChatRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Store latest callbacks in refs so we don't recreate EventSource when callbacks change
  const callbacksRef = useRef({
    onMessageCreated,
    onThreadUpdated,
    onTypingUpdate,
    onPresenceUpdate,
    onReadUpdate,
    onQueueUpdated,
  });

  useEffect(() => {
    callbacksRef.current = {
      onMessageCreated,
      onThreadUpdated,
      onTypingUpdate,
      onPresenceUpdate,
      onReadUpdate,
      onQueueUpdated,
    };
  });

  useEffect(() => {
    if (!threadId) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isDisposed = false;

    const connect = () => {
      if (isDisposed || !threadId) return;

      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const sseUrl = `/api/chat?threadId=${encodeURIComponent(threadId)}&stream=1&surface=${surface}`;
      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.onopen = () => {
        if (isDisposed) {
          es.close();
          return;
        }
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      es.onerror = (e) => {
        if (isDisposed) return;
        setIsConnected(false);
        es.close();
        if (esRef.current === es) {
          esRef.current = null;
        }

        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (!isDisposed) {
              connect();
            }
          }, 3000);
        }
      };

      es.addEventListener("message.created", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          const msg = data.payload?.message;
          // STRICT ISOLATION: verify message belongs to THIS active thread
          if (msg && (!msg.threadId || msg.threadId === threadId)) {
            callbacksRef.current.onMessageCreated(msg, data.payload?.clientMessageId);
          }
        } catch (err) {
          console.error("Failed to parse message.created event", err);
        }
      });

      es.addEventListener("thread.updated", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          const thr = data.payload?.thread;
          if (thr && (!thr.id || thr.id === threadId)) {
            callbacksRef.current.onThreadUpdated?.(thr);
          }
        } catch {
          // Ignore malformed SSE payload
        }
      });

      es.addEventListener("typing.update", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (
            data.payload?.typers &&
            (!data.payload?.threadId || data.payload.threadId === threadId)
          ) {
            callbacksRef.current.onTypingUpdate?.(data.payload.typers);
          }
        } catch {
          // Ignore malformed SSE payload
        }
      });

      es.addEventListener("presence.update", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (
            data.payload?.participants &&
            (!data.payload?.threadId || data.payload.threadId === threadId)
          ) {
            callbacksRef.current.onPresenceUpdate?.(data.payload.participants);
          }
        } catch {
          // Ignore malformed SSE payload
        }
      });

      es.addEventListener("read.update", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.payload && (!data.payload.threadId || data.payload.threadId === threadId)) {
            callbacksRef.current.onReadUpdate?.(data.payload);
          }
        } catch {
          // Ignore malformed SSE payload
        }
      });

      es.addEventListener("queue.updated", (event: MessageEvent) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.payload?.queueMetrics) {
            callbacksRef.current.onQueueUpdated?.(data.payload.queueMetrics);
          }
        } catch {
          // Ignore malformed SSE payload
        }
      });
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setIsConnected(false);
    };
  }, [threadId, surface]);

  return { isConnected };
}
