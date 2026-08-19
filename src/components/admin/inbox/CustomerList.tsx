import React, { useMemo } from "react";
import {
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Flame,
  UserCheck,
  Filter,
  Sparkles,
  Inbox,
} from "lucide-react";
import { Thread, Order } from "@/lib/types";
import { InboxFilter, FilterOption } from "./types";

interface CustomerListProps {
  threads: Thread[];
  orders?: Order[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  activeFilter: InboxFilter;
  onChangeFilter: (filter: InboxFilter) => void;
  searchTerm: string;
  onChangeSearchTerm: (term: string) => void;
  isLoading?: boolean;
}

export function CustomerList({
  threads,
  orders = [],
  selectedThreadId,
  onSelectThread,
  activeFilter,
  onChangeFilter,
  searchTerm,
  onChangeSearchTerm,
  isLoading = false,
}: CustomerListProps) {
  // Map orders for fast lookup
  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      map.set(o.id, o);
    }
    return map;
  }, [orders]);

  // Compute filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<InboxFilter, number> = {
      all: threads.length,
      needs_reply: 0,
      active_chats: 0,
      active_orders: 0,
      active_tickets: 0,
      order_preparation: 0,
      waiting_user: 0,
      waiting_admin: 0,
      escalated: 0,
      completed_orders: 0,
      closed_tickets: 0,
    };

    for (const t of threads) {
      const isClosed = t.status === "closed" || t.mode === "RESOLVED";
      const hasOrder = Boolean(t.orderId);
      const linkedOrder = t.orderId ? orderMap.get(t.orderId) : undefined;
      const orderIsActive = linkedOrder
        ? linkedOrder.status !== "completed" && linkedOrder.status !== "cancelled"
        : true;
      const orderIsCompleted = linkedOrder ? linkedOrder.status === "completed" : false;

      if (t.needsAdmin || t.mode === "WAITING_FOR_ADMIN" || t.mode === "ESCALATED") {
        counts.needs_reply++;
      }
      if (t.status === "open" && !isClosed) {
        counts.active_chats++;
      }
      if (hasOrder && orderIsActive && !isClosed) {
        counts.active_orders++;
      }
      if (!hasOrder && t.status === "open" && !isClosed) {
        counts.active_tickets++;
      }
      if (t.mode === "ORDER_PREPARATION") {
        counts.order_preparation++;
      }
      if (t.mode === "WAITING_FOR_USER") {
        counts.waiting_user++;
      }
      if (t.mode === "WAITING_FOR_ADMIN") {
        counts.waiting_admin++;
      }
      if (t.mode === "ESCALATED") {
        counts.escalated++;
      }
      if (hasOrder && orderIsCompleted) {
        counts.completed_orders++;
      }
      if (isClosed) {
        counts.closed_tickets++;
      }
    }

    return counts;
  }, [threads, orderMap]);

  // Filter and search threads
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const isClosed = t.status === "closed" || t.mode === "RESOLVED";
      const hasOrder = Boolean(t.orderId);
      const linkedOrder = t.orderId ? orderMap.get(t.orderId) : undefined;
      const orderIsActive = linkedOrder
        ? linkedOrder.status !== "completed" && linkedOrder.status !== "cancelled"
        : true;
      const orderIsCompleted = linkedOrder ? linkedOrder.status === "completed" : false;

      // Filter check
      let matchesFilter = true;
      switch (activeFilter) {
        case "needs_reply":
          matchesFilter = Boolean(
            t.needsAdmin || t.mode === "WAITING_FOR_ADMIN" || t.mode === "ESCALATED",
          );
          break;
        case "active_chats":
          matchesFilter = t.status === "open" && !isClosed;
          break;
        case "active_orders":
          matchesFilter = hasOrder && orderIsActive && !isClosed;
          break;
        case "active_tickets":
          matchesFilter = !hasOrder && t.status === "open" && !isClosed;
          break;
        case "order_preparation":
          matchesFilter = t.mode === "ORDER_PREPARATION";
          break;
        case "waiting_user":
          matchesFilter = t.mode === "WAITING_FOR_USER";
          break;
        case "waiting_admin":
          matchesFilter = t.mode === "WAITING_FOR_ADMIN";
          break;
        case "escalated":
          matchesFilter = t.mode === "ESCALATED";
          break;
        case "completed_orders":
          matchesFilter = hasOrder && orderIsCompleted;
          break;
        case "closed_tickets":
          matchesFilter = isClosed;
          break;
        case "all":
        default:
          matchesFilter = true;
          break;
      }

      if (!matchesFilter) return false;

      // Search term check
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const matchName = t.userName?.toLowerCase().includes(q);
      const matchSubject = t.subject?.toLowerCase().includes(q);
      const matchPreview = t.lastMessagePreview?.toLowerCase().includes(q);
      const matchOrderId = t.orderId?.toLowerCase().includes(q);
      const matchOrderCode = linkedOrder?.code?.toLowerCase().includes(q);

      return matchName || matchSubject || matchPreview || matchOrderId || matchOrderCode;
    });
  }, [threads, activeFilter, searchTerm, orderMap]);

  // Format relative timestamp
  const formatTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "الآن";
      if (mins < 60) return `منذ ${mins} د`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `منذ ${hours} س`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `منذ ${days} يوم`;
      return new Date(isoString).toLocaleDateString("ar-IQ", {
        month: "numeric",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const FILTERS: { id: InboxFilter; label: string; color?: string }[] = [
    { id: "all", label: "الكل" },
    { id: "needs_reply", label: "بحاجة إلى رد", color: "text-red-600 bg-red-500/10" },
    { id: "active_chats", label: "المحادثات الجارية" },
    { id: "active_orders", label: "طلبات نشطة", color: "text-blue-600 bg-blue-500/10" },
    { id: "active_tickets", label: "تذاكر نشطة" },
    { id: "order_preparation", label: "قيد التجهيز", color: "text-amber-600 bg-amber-500/10" },
    { id: "waiting_user", label: "بانتظار العميل" },
    { id: "waiting_admin", label: "بانتظار الإدارة" },
    { id: "escalated", label: "المصعّدة", color: "text-purple-600 bg-purple-500/10" },
    { id: "completed_orders", label: "طلبات مكتملة" },
    { id: "closed_tickets", label: "تذاكر مغلقة" },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-card overflow-hidden" dir="rtl">
      {/* Header & Search Bar */}
      <div className="p-3 border-b border-border bg-card space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">صندوق المحادثات</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-bold text-muted-foreground">
              {threads.length}
            </span>
          </div>
          {filterCounts.needs_reply > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 animate-pulse">
              <Flame className="w-3 h-3" />
              <span>{filterCounts.needs_reply} بانتظار الرد</span>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            id="inbox-search-input"
            placeholder="بحث بالاسم، رقم الطلب، أو الموضوع..."
            value={searchTerm}
            onChange={(e) => onChangeSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 bg-muted/40 border border-border rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground/70"
          />
          {searchTerm && (
            <button
              onClick={() => onChangeSearchTerm("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              مسح
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map((f) => {
            const count = filterCounts[f.id] || 0;
            const isSelected = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onChangeFilter(f.id)}
                className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? "bg-foreground text-background shadow-2xs font-bold"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isSelected
                      ? "bg-background/20 text-background"
                      : f.color || "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Threads List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-1.5 space-y-1">
        {isLoading ? (
          <div className="p-4 space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-18 bg-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-xs space-y-2">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/30" />
            <div className="font-semibold">لا توجد محادثات مطابقة</div>
            <p className="text-[11px] text-muted-foreground/70">
              جرب تغيير التصفية أو مسح كلمة البحث
            </p>
          </div>
        ) : (
          filteredThreads.map((t) => {
            const isSelected = selectedThreadId === t.id;
            const needsAdmin =
              t.needsAdmin || t.mode === "WAITING_FOR_ADMIN" || t.mode === "ESCALATED";
            const linkedOrder = t.orderId ? orderMap.get(t.orderId) : undefined;

            return (
              <div
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${
                  isSelected
                    ? "bg-primary/5 border-primary/40 shadow-xs scale-[0.99]"
                    : "bg-card border-border/30 hover:bg-muted/40 hover:border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-primary/15">
                      {t.userName ? t.userName.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-foreground truncate flex items-center gap-1.5">
                        <span>{t.userName || "عميل بدون اسم"}</span>
                        {needsAdmin && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {t.subject || "استفسار جديد"}
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(t.lastMessageAt || t.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Preview snippet */}
                <p className="text-xs text-muted-foreground line-clamp-1 mb-2 pr-10 font-sans">
                  {t.lastMessagePreview || "لا توجد رسائل سابقة"}
                </p>

                {/* Badges footer */}
                <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-border/30">
                  <div className="flex items-center gap-1.5 overflow-hidden flex-wrap">
                    {/* Chat Type badge */}
                    {t.chatType && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          t.chatType === "AUTOMATED_SUPPORT"
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                            : t.chatType === "GENERAL_SUPPORT"
                              ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                              : t.chatType === "DELIVERY"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {t.chatType === "AUTOMATED_SUPPORT"
                          ? "🤖 آلي"
                          : t.chatType === "GENERAL_SUPPORT"
                            ? "👤 إدارة"
                            : t.chatType === "DELIVERY"
                              ? "⚡ تسليم"
                              : "📦 طلب"}
                      </span>
                    )}

                    {/* Mode badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        t.mode === "ORDER_PREPARATION"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : t.mode === "WAITING_FOR_USER"
                            ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                            : t.mode === "ESCALATED"
                              ? "bg-purple-500/15 text-purple-700 dark:text-purple-400"
                              : t.mode === "RESOLVED" || t.status === "closed"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.mode === "ORDER_PREPARATION"
                        ? "تجهيز طلب"
                        : t.mode === "WAITING_FOR_USER"
                          ? "بانتظار العميل"
                          : t.mode === "WAITING_FOR_ADMIN"
                            ? "بانتظار الإدارة"
                            : t.mode === "ESCALATED"
                              ? "تصعيد مشرف"
                              : t.mode === "ADMIN_ACTIVE"
                                ? "مشرف نشط"
                                : t.mode === "RESOLVED"
                                  ? "تم الحل"
                                  : "تلقائي AI"}
                    </span>

                    {/* Order code badge */}
                    {(t.orderId || linkedOrder) && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-mono font-bold flex items-center gap-1">
                        <ShoppingBag className="w-2.5 h-2.5" />#
                        {linkedOrder?.code || t.orderId?.slice(-6)}
                      </span>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <span
                    className={`font-semibold shrink-0 ${
                      t.status === "open" ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  >
                    {t.status === "open" ? "مفتوحة" : "مغلقة"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
