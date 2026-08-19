import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { Thread, ChatMessage, ThreadMode, Order } from "@/lib/types";

interface ThreadMessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}
import { api } from "@/lib/api";
import {
  getAdminThreads,
  getThreadMessages,
  setThreadMode,
  setThreadStatus,
  markThreadAsRead,
} from "@/lib/support.functions";
import { CustomerList } from "./CustomerList";
import { ActiveConversation, ConversationErrorBoundary } from "./ActiveConversation";
import { AdminAvailabilityBar } from "./AdminAvailabilityBar";
import { InboxFilter } from "./types";
import { toast } from "sonner";

interface AdminInboxViewProps {
  initialThreadId?: string | null;
  onNavigateToOrder?: (orderId: string) => void;
}

export function AdminInboxView({ initialThreadId = null, onNavigateToOrder }: AdminInboxViewProps) {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId);
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Sync initialThreadId changes from parent or URL
  useEffect(() => {
    if (initialThreadId) {
      setSelectedThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  // 1. Fetch all admin threads with 8s polling interval
  const { data: threads = [], isLoading: isThreadsLoading } = useQuery({
    queryKey: ["admin-threads"],
    queryFn: async () => {
      try {
        const res = await getAdminThreads();
        return (res || []) as Thread[];
      } catch (err) {
        console.error("Error fetching admin threads:", err);
        return [] as Thread[];
      }
    },
    refetchInterval: 8000,
  });

  // 2. Fetch admin orders to cross-reference customer history & linked orders
  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/orders?all=1", { credentials: "include" });
        if (!res.ok) return [] as Order[];
        const data = await res.json();
        return (data.orders || []) as Order[];
      } catch {
        return [] as Order[];
      }
    },
    refetchInterval: 15000,
  });

  // 3. Auto-select first thread if none selected on desktop
  useEffect(() => {
    if (
      !selectedThreadId &&
      threads.length > 0 &&
      typeof window !== "undefined" &&
      window.innerWidth >= 768
    ) {
      setSelectedThreadId(threads[0]?.id ?? null);
    }
  }, [threads, selectedThreadId]);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // 4. Fetch initial messages
  const { data: initialMessagesData, isLoading: isMessagesLoading } = useQuery({
    queryKey: ["thread-messages", selectedThreadId],
    queryFn: async () => {
      if (!selectedThreadId) return null;
      try {
        const res = (await getThreadMessages({
          data: { threadId: selectedThreadId, limit: 15 },
        })) as ThreadMessagesPage;
        return res;
      } catch (err) {
        console.error("Error fetching thread messages:", err);
        return null;
      }
    },
    enabled: !!selectedThreadId,
    // Polling removed in favor of SSE
  });

  // State to hold all messages combining initial + realtime
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);
  const [isCustomerOnline, setIsCustomerOnline] = useState(false);
  const [customerLastReadAt, setCustomerLastReadAt] = useState<string | null>(null);

  // Update live messages when initial messages load or thread changes
  useEffect(() => {
    if (initialMessagesData) {
      setLiveMessages(initialMessagesData.messages);
      setHasMore(initialMessagesData.hasMore);
      setNextCursor(initialMessagesData.nextCursor);
    } else {
      setLiveMessages([]);
      setHasMore(false);
      setNextCursor(null);
    }
  }, [initialMessagesData, selectedThreadId]);

  const handleLoadOlder = async (container: HTMLDivElement | null) => {
    if (!selectedThreadId || !nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);

    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    try {
      const res = (await getThreadMessages({
        data: { threadId: selectedThreadId, before: nextCursor, limit: 15 },
      })) as ThreadMessagesPage;
      setLiveMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } catch (err) {
      console.error("Failed to load older messages", err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  useChatRealtime({
    threadId: selectedThreadId,
    surface: "admin",
    onMessageCreated: (rawMsg, clientMsgId) => {
      setLiveMessages((prev) => {
        const existsById = prev.some((m) => m.id === rawMsg.id);
        if (existsById) return prev;

        const existingTempIndex = clientMsgId ? prev.findIndex((m) => m.id === clientMsgId) : -1;

        if (existingTempIndex !== -1) {
          const copy = [...prev];
          copy[existingTempIndex] = rawMsg;
          return copy;
        }
        return [...prev, rawMsg];
      });
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
    onThreadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
    onTypingUpdate: (typers) => {
      const isCustomerTypingNow = typers.some((t) => t.senderRole === "user");
      setIsCustomerTyping(isCustomerTypingNow);
    },
    onPresenceUpdate: (participants) => {
      const isCustomerOnlineNow = participants.some((p) => true); // In this basic implementation we just assume they are online if we got a heartbeat from them
      setIsCustomerOnline(isCustomerOnlineNow);
    },
    onReadUpdate: (data) => {
      if (data.readerRole === "user") {
        setCustomerLastReadAt(data.lastReadAt);
      }
    },
  });

  // Heartbeat presence interval for admin
  useEffect(() => {
    if (!selectedThreadId) return;
    const presenceInterval = setInterval(() => {
      void api.sendPresence(selectedThreadId, "admin");
    }, 45_000);
    void api.sendPresence(selectedThreadId, "admin");
    return () => clearInterval(presenceInterval);
  }, [selectedThreadId]);

  // 5. Mark thread as read when selected
  const markReadMutation = useMutation({
    mutationFn: (threadId: string) => markThreadAsRead({ data: { threadId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
  });

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    markReadMutation.mutate(threadId);
  };

  // 6. Send message mutation with optimistic updates
  const sendMutation = useMutation({
    mutationFn: (data: {
      threadId: string;
      text?: string;
      kind?: string;
      body?: any;
      imageUrl?: string;
      clientMessageId?: string;
    }) => {
      const payload: any = {
        threadId: data.threadId,
        surface: "admin",
        clientMessageId: data.clientMessageId || `temp-${Date.now()}`,
      };
      if (data.text) payload.text = data.text;
      if (data.kind) payload.kind = data.kind;
      if (data.body) payload.body = data.body;
      if (data.imageUrl) {
        payload.body = { ...payload.body, imageUrl: data.imageUrl };
      }
      return api.sendMessage(payload);
    },
    onMutate: async (newMsgData) => {
      await queryClient.cancelQueries({ queryKey: ["thread-messages", selectedThreadId] });

      const tempId = newMsgData.clientMessageId || `temp-${Date.now()}`;
      if (selectedThreadId) {
        const optimisticMsg: ChatMessage = {
          id: tempId,
          threadId: selectedThreadId,
          senderRole: "admin",
          senderName: "المشرف",
          kind: (newMsgData.kind as any) || (newMsgData.imageUrl ? "image" : "text"),
          body: {
            ...newMsgData.body,
            text: newMsgData.text,
            imageUrl: newMsgData.imageUrl,
          },
          createdAt: new Date().toISOString(),
        };

        setLiveMessages((prev) => [...prev, optimisticMsg]);
      }

      return { tempId };
    },
    onError: (err, newMsgData, context) => {
      if (context?.tempId) {
        setLiveMessages((prev) => prev.filter((m) => m.id !== context.tempId));
      }
      toast.error("فشل إرسال الرسالة، يرجى إعادة المحاولة");
    },
    onSettled: () => {
      // Re-fetch threads
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
  });

  // 7. Mode mutation
  const modeMutation = useMutation({
    mutationFn: (data: { threadId: string; mode: string }) => setThreadMode({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
  });

  // 8. Status mutation
  const statusMutation = useMutation({
    mutationFn: (data: { threadId: string; status: "open" | "closed" }) =>
      setThreadStatus({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-threads"] });
    },
  });

  // Hotkey support: Ctrl+K / Cmd+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchEl = document.getElementById("inbox-search-input");
        searchEl?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;

  return (
    <ConversationErrorBoundary>
      <div
        className="w-full h-full flex flex-col overflow-hidden bg-card"
        style={{ direction: "rtl" }}
      >
        {/* Top Bar: Admin Availability Status & Scheduling */}
        <AdminAvailabilityBar />

        <div
          className="w-full flex-1 flex flex-col md:flex-row overflow-hidden"
          style={{ direction: "ltr" }}
        >
          {/* Column 1: Customer List Sidebar (Left on Desktop: 340-380px) */}
          <div
            className={`w-full md:w-[340px] xl:w-[380px] h-full shrink-0 border-r border-border bg-card flex flex-col ${
              selectedThreadId ? "hidden md:flex" : "flex"
            }`}
            style={{ direction: "rtl" }}
          >
            <CustomerList
              threads={threads}
              orders={orders}
              selectedThreadId={selectedThreadId}
              onSelectThread={handleSelectThread}
              activeFilter={activeFilter}
              onChangeFilter={setActiveFilter}
              searchTerm={searchTerm}
              onChangeSearchTerm={setSearchTerm}
              isLoading={isThreadsLoading}
            />
          </div>

          {/* Column 2: Active Conversation Main Area (Center/Right on Desktop: 1fr) */}
          <div
            className={`flex-1 h-full min-w-0 bg-card flex flex-col ${
              !selectedThreadId ? "hidden md:flex" : "flex"
            }`}
            style={{ direction: "rtl" }}
          >
            <ActiveConversation
              thread={selectedThread}
              messages={liveMessages}
              orders={orders}
              isLoadingMessages={isMessagesLoading && liveMessages.length === 0}
              isCustomerOnline={isCustomerOnline}
              isCustomerTyping={isCustomerTyping}
              customerLastReadAt={customerLastReadAt}
              hasMore={hasMore}
              isLoadingOlder={isLoadingOlder}
              onLoadOlder={handleLoadOlder}
              onBackToList={() => setSelectedThreadId(null)}
              onNavigateToOrder={onNavigateToOrder}
              onSendMessage={(payload) => {
                if (selectedThreadId) {
                  sendMutation.mutate({
                    threadId: selectedThreadId,
                    clientMessageId:
                      (payload as any).clientMessageId ||
                      `admin-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    ...payload,
                  });
                }
              }}
              onSetThreadMode={(mode) => {
                if (selectedThreadId) {
                  modeMutation.mutate({ threadId: selectedThreadId, mode });
                }
              }}
              onSetThreadStatus={(status) => {
                if (selectedThreadId) {
                  statusMutation.mutate({ threadId: selectedThreadId, status });
                }
              }}
              isSending={sendMutation.isPending}
            />
          </div>
        </div>
      </div>
    </ConversationErrorBoundary>
  );
}
export default AdminInboxView;
