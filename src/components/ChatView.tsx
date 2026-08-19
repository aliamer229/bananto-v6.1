import { tr } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  Check,
  CheckCheck,
  Clock,
  CreditCard,
  FileText,
  Headset,
  Image as ImageIcon,
  MapPin,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
  Zap,
  Bot,
  Sparkles,
  User,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

import Strands from "@/components/ui/Strands";
import { FlipWords } from "@/components/ui/flip-words";
import { SquigglyText } from "@/components/ui/squiggly-text";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth } from "@/hooks/useAuth";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { api, uploadFileWithProgress } from "@/lib/api";
import { supportAnswer, type SupportContext } from "@/lib/support";
import { viewHistoryForSupport } from "@/lib/view-history";
import type {
  Address,
  ChatMessage,
  Order,
  Product,
  ChatType,
  AdminAvailabilityStatus,
} from "@/lib/types";
import { cdnImage } from "@/lib/img";
import { accountCardTypeFor } from "@/lib/account-cards";
import AccountCard from "@/components/chat/AccountCard";

export type MessageStatus = "sending" | "sent" | "failed";

export type DisplayMessage = {
  id: string;
  clientMessageId?: string;
  sender: "ai" | "user";
  text: string;
  type?: "text" | "product" | "location" | "wallet" | "order" | "image" | "account_card";
  payload?: Record<string, unknown>;
  createdAt?: string;
  status?: MessageStatus;
  uploadProgress?: number;
};

const priceOf = (product: Product) => Number(product.price ?? 0);

function OrderSelectionView({
  orders,
  onSend,
}: {
  orders: Order[];
  onSend: (order: Order) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-4 text-right" dir="rtl">
      <h2 className="mb-4 text-xl font-bold text-[var(--ink)]">{tr("اختيار الطلب")}</h2>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-card p-4 shadow-xs transition-colors hover:border-[var(--ink)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-[var(--ink)]">{order.code}</span>
              <span
                className={`rounded-md px-2 py-1 text-xs font-bold ${
                  order.status === "completed"
                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                    : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                }`}
              >
                {order.status === "completed" ? "تم التسليم" : "قيد التجهيز"}
              </span>
            </div>
            <p className="text-sm text-[var(--ink)]/70">
              {order.items.map((item) => item.title).join("، ")}
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-[var(--line)]/50 pt-2">
              <span className="font-bold text-[var(--ink)]">
                {order.total.toLocaleString()} {order.currency}
              </span>
              <button
                onClick={() => onSend(order)}
                className="rounded-xl bg-[var(--surface-3)] px-4 py-2 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-white cursor-pointer"
              >
                {tr("اختيار")}
              </button>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="py-10 text-center">
            <FileText className="mx-auto mb-3 h-12 w-12 text-[var(--line)] opacity-50" />
            <p className="font-medium text-[var(--muted-ink)]">{tr("لا توجد طلبات بعد")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductSelectionView({
  products,
  favorites,
  purchased,
  onSend,
}: {
  products: Product[];
  favorites: (string | number)[];
  purchased: Product[];
  onSend: (product: Product) => void;
}) {
  const [tab, setTab] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    { id: "search", label: "البحث بالموقع" },
    { id: "fav", label: "المفضلة" },
    { id: "purchases", label: "المشتريات" },
    { id: "history", label: "سجل المشاهدة" },
  ];

  const history = useMemo(() => {
    if (typeof window === "undefined") return [] as Product[];
    try {
      const ids = JSON.parse(localStorage.getItem("recentlyViewed") ?? "[]") as (string | number)[];
      return ids
        .map((id) => products.find((product) => String(product.id) === String(id)))
        .filter((product): product is Product => Boolean(product));
    } catch {
      return [];
    }
  }, [products]);

  const getProducts = () => {
    if (tab === "search")
      return products
        .filter((product) => String(product.title ?? "").includes(searchQuery))
        .slice(0, 30);
    if (tab === "fav")
      return products.filter((product) =>
        favorites.some((id) => String(id) === String(product.id)),
      );
    if (tab === "purchases") return purchased;
    return history;
  };

  const list = getProducts();

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-4 text-right" dir="rtl">
      <h2 className="mb-4 text-xl font-bold text-[var(--ink)]">{tr("إرسال منتج")}</h2>
      <div
        className="scrollbar-hide mb-4 flex shrink-0 gap-2 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              tab === t.id
                ? "bg-[var(--ink)] text-white shadow-xs"
                : "bg-[var(--surface-3)] text-[var(--ink)] hover:bg-[var(--line)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="relative mb-4 shrink-0">
          <input
            type="text"
            placeholder={tr("ابحث عن منتج...")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-[48px] w-full rounded-xl border border-[var(--line)] bg-card pl-4 pr-10 text-right focus:border-[var(--ink)] focus:outline-none"
          />
          <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-ink)]" />
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {list.map((product) => (
          <div
            key={String(product.id)}
            className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-card p-3 shadow-xs transition-colors hover:border-[var(--ink)]/30"
          >
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface)] text-2xl font-bold text-[var(--ink)]/30">
              {product.image ? (
                <img
                  src={cdnImage(String(product.image))}
                  alt={String(product.title ?? "")}
                  className="h-full w-full object-cover"
                />
              ) : (
                String(product.title ?? "?").slice(0, 1)
              )}
            </div>
            <div className="flex-1 text-right">
              <h3 className="line-clamp-1 text-[14px] font-semibold text-[var(--ink)]">
                {String(product.title ?? "")}
              </h3>
              <p className="mb-1 text-[11px] text-[var(--muted-ink)]">
                {String(product.genre ?? product.publisher ?? "")}
              </p>
              <p className="text-[13px] font-bold text-[var(--ink)]">
                {priceOf(product).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => onSend(product)}
              className="shrink-0 rounded-xl bg-[var(--surface-3)] p-3 text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-white cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="py-10 text-center">
            <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-[var(--line)] opacity-50" />
            <p className="font-medium text-[var(--muted-ink)]">{tr("لا توجد منتجات مطابقة")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationSelectionView({
  addresses,
  onSend,
}: {
  addresses: Address[];
  onSend: (label: string) => void;
}) {
  const [mode, setMode] = useState("list");
  const [newLocation, setNewLocation] = useState("");

  if (mode === "new") {
    return (
      <div
        className="flex h-full flex-col overflow-y-auto overflow-x-hidden pb-4 text-right"
        dir="rtl"
      >
        <div className="mb-4 flex items-center">
          <button
            onClick={() => setMode("list")}
            className="ml-auto rounded-full bg-[var(--surface-3)] p-2 text-[var(--ink)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-xl font-bold text-[var(--ink)]">{tr("موقع جديد")}</h2>
        </div>
        <div className="relative mb-4 flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-3)]">
          <div className="relative z-10 flex flex-col items-center">
            <div className="absolute h-4 w-4 animate-ping rounded-full bg-red-500" />
            <MapPin className="relative z-10 -mt-5 h-10 w-10 text-red-600 drop-shadow-md" />
          </div>
        </div>
        <input
          type="text"
          value={newLocation}
          onChange={(event) => setNewLocation(event.target.value)}
          placeholder={tr("اكتب عنوان التوصيل بالتفصيل...")}
          className="mb-4 h-[48px] w-full shrink-0 rounded-xl border border-[var(--line)] bg-card px-4 text-right focus:border-[var(--ink)] focus:outline-none"
        />
        <button
          onClick={() => newLocation.trim() && onSend(newLocation.trim())}
          className={`w-full rounded-xl py-3 font-bold transition-colors cursor-pointer ${
            newLocation.trim()
              ? "bg-[var(--ink)] text-white hover:bg-[var(--ink-strong)]"
              : "cursor-not-allowed bg-[var(--line)] text-white"
          }`}
        >
          {tr("تأكيد وإرسال")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden pb-4 text-right"
      dir="rtl"
    >
      <h2 className="mb-4 text-xl font-bold text-[var(--ink)]">{tr("إرسال موقع")}</h2>
      <div className="relative mb-4 flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-3)] shadow-inner">
        <div className="relative z-10 flex items-center gap-2 rounded-full border border-white/60 bg-card/80 px-4 py-2 shadow-xs backdrop-blur-sm">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-bold text-[var(--ink)]">
            {tr("عناوين التوصيل الخاصة بك")}
          </span>
        </div>
      </div>
      <div className="space-y-3 overflow-y-auto pb-4">
        <h3 className="text-sm font-bold text-[var(--ink)]/70">{tr("عناويني المحفوظة")}</h3>
        {addresses.map((address) => (
          <button
            key={address.id}
            onClick={() =>
              onSend(
                `${address.label} (${address.city}${address.street ? `، ${address.street}` : ""})`,
              )
            }
            className="group flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-card p-4 shadow-xs transition-colors hover:border-[var(--ink)] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--surface)] p-2 text-[var(--ink)]">
                <MapPin className="h-5 w-5" />
              </div>
              <span className="text-[14px] font-bold text-[var(--ink)]">{address.label}</span>
            </div>
            <Send className="h-4 w-4 text-[var(--muted-ink)] transition-colors group-hover:text-[var(--ink)]" />
          </button>
        ))}

        <button
          onClick={() => setMode("new")}
          className="mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] p-4 text-white shadow-xs transition-colors hover:bg-[var(--ink-strong)] cursor-pointer"
        >
          <MapPin className="h-5 w-5" />
          <span className="text-[14px] font-bold">{tr("موقع جديد...")}</span>
        </button>
      </div>
    </div>
  );
}

function WalletView({ balance, onSend }: { balance: number; onSend: (value: string) => void }) {
  const { currency, getCurrencyInfo } = useCurrency();
  const activeCurrencyInfo = getCurrencyInfo(currency);
  const [amount, setAmount] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [mode, setMode] = useState("main");

  if (mode === "topup") {
    return (
      <div
        className="flex h-full flex-col overflow-y-auto overflow-x-hidden pb-4 text-right"
        dir="rtl"
      >
        <div className="mb-6 flex items-center">
          <button
            onClick={() => setMode("main")}
            className="ml-auto rounded-full bg-[var(--surface-3)] p-2 text-[var(--ink)] transition-colors hover:bg-[var(--line)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-xl font-bold text-[var(--ink)]">{tr("تعبئة الرصيد")}</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <p className="mb-4 text-sm font-medium text-[var(--ink)]/80">
            {tr("اختر طريقة الدفع لتعبئة محفظتك:")}
          </p>
          <div className="space-y-3">
            {["Apple Pay", "زين كاش", "البطاقة الائتمانية"].map((method) => (
              <button
                key={method}
                onClick={() => onSend("topup_request")}
                className="group flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-card p-4 shadow-xs transition-colors hover:border-[var(--ink)] cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface)] transition-colors group-hover:bg-[var(--surface-3)]">
                  <CreditCard className="h-5 w-5 text-[var(--ink)]" />
                </div>
                <span className="font-bold text-[var(--ink)]">{method}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden pb-4 text-right"
      dir="rtl"
    >
      <h2 className="mb-4 text-xl font-bold text-[var(--ink)]">{tr("المحفظة")}</h2>

      <div className="relative mb-6 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--ink)] to-[var(--ink-strong)] p-6 text-[var(--surface)] shadow-lg">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-32 w-32 rounded-full bg-card/5 blur-xl" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-[#B497CF]/20 blur-lg" />

        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="mb-1 text-sm font-medium opacity-80">{tr("إجمالي مشترياتك")}</p>
            <h3 className="mb-4 text-3xl font-black">
              {balance.toLocaleString()}{" "}
              <span className="text-base font-medium opacity-80">
                {activeCurrencyInfo?.symbol || "د.ع"}
              </span>
            </h3>
          </div>
          <Wallet className="h-8 w-8 opacity-50" />
        </div>
        <button
          onClick={() => setMode("topup")}
          className="relative z-10 flex w-fit items-center gap-1 rounded-xl bg-card px-4 py-2 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--surface)] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          {tr("تعبئة الرصيد")}
        </button>
      </div>

      {!confirmStep ? (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--ink)]/70">{tr("إرسال مبلغ بالمحادثة")}</h3>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="h-[56px] w-full rounded-xl border border-[var(--line)] bg-card px-4 text-right text-lg font-bold focus:border-[var(--ink)] focus:outline-none"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-[var(--muted-ink)]">
              {activeCurrencyInfo?.symbol || "د.ع"}
            </span>
          </div>
          <button
            onClick={() => {
              if (amount && Number(amount) > 0) setConfirmStep(true);
            }}
            className={`h-[56px] w-full rounded-xl text-lg font-bold text-white transition-colors cursor-pointer ${
              amount && Number(amount) > 0
                ? "bg-[var(--ink)] hover:bg-[var(--ink-strong)]"
                : "cursor-not-allowed bg-[var(--line)]"
            }`}
          >
            {tr("تأكيد")}
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-5 rounded-2xl border border-[var(--line)] bg-card p-6 shadow-xs"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)]">
            <Send className="ml-1 h-6 w-6" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-[var(--ink)]">{tr("تأكيد الإرسال")}</h3>
            <p className="mt-2 text-[var(--ink)]/70">
              هل أنت متأكد من إرسال مبلغ{" "}
              <span className="text-lg font-bold text-[var(--ink)]">
                {amount} {activeCurrencyInfo?.symbol || "د.ع"}
              </span>{" "}
              في المحادثة؟
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setConfirmStep(false)}
              className="h-[50px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--surface-3)] cursor-pointer"
            >
              {tr("إلغاء")}
            </button>
            <button
              onClick={() => onSend(amount)}
              className="h-[50px] flex-[2] rounded-xl bg-[var(--ink)] font-bold text-white transition-colors hover:bg-[var(--ink-strong)] cursor-pointer"
            >
              {tr("إرسال الآن")}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function ChatView({
  onBack,
  initialThreadId,
}: {
  onBack?: () => void;
  initialThreadId?: string;
}) {
  const { currency, getCurrencyInfo } = useCurrency();
  const activeCurrencyInfo = getCurrencyInfo(currency);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  const [inputText, setInputText] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const [localMessages, setLocalMessages] = useState<DisplayMessage[]>([]);
  const [serverMessages, setServerMessages] = useState<DisplayMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [isSelfTyping, setIsSelfTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unreadCountBelow, setUnreadCountBelow] = useState(0);
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([
    "تصفح الألعاب",
    "أحدث الإكسسوارات",
    "تحدث مع الدعم",
  ]);
  const [selectedNav, setSelectedNav] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [showHistory, setShowHistory] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused">("idle");
  const [recordingTime, setRecordingTime] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- live data from the store / account -------------------------------
  const storeQuery = useQuery({ queryKey: ["store"], queryFn: () => api.store() });
  const ordersQuery = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders(),
    enabled: Boolean(user),
  });
  const threadsQuery = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads(),
    enabled: Boolean(user),
    refetchInterval: 12_000,
  });

  const products = storeQuery.data?.products ?? [];
  const settings = (storeQuery.data?.settings ?? {}) as Record<string, unknown>;
  const orders = ordersQuery.data?.orders ?? [];
  const threads = threadsQuery.data?.threads ?? [];
  const purchased = useMemo(() => {
    const ids = new Set(
      orders.flatMap((order) => order.items.map((item) => String(item.productId))),
    );
    return products.filter((product) => ids.has(String(product.id)));
  }, [orders, products]);
  const spent = orders.reduce((sum, order) => sum + order.total, 0);

  const isHumanChat = Boolean(threadId);

  const currentThread = useMemo(
    () => (threadId ? threads.find((t) => t.id === threadId) : null),
    [threads, threadId],
  );

  const createThread = useMutation({
    mutationFn: (args?: string | { subject?: string; chatType?: ChatType; orderId?: string }) => {
      if (typeof args === "string") {
        return api.createThread(args);
      }
      return api.createThread(args?.subject, args?.chatType, args?.orderId);
    },
    onSuccess: (data) => {
      setThreadId(data.thread.id);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  // Map raw ChatMessage to DisplayMessage
  const mapServerMessage = useCallback((message: ChatMessage): DisplayMessage => {
    const mine = message.senderRole === "user";
    const imageUrl = message.body?.["imageUrl"] as string | undefined;
    const cardType = accountCardTypeFor(message.kind);
    if (cardType) {
      return {
        id: message.id,
        sender: mine ? "user" : "ai",
        text: String(message.body?.["text"] ?? ""),
        type: "account_card" as const,
        payload: { kind: message.kind, body: message.body },
        createdAt: message.createdAt,
        status: "sent",
      };
    }
    return {
      id: message.id,
      sender: mine ? "user" : "ai",
      text: String(message.body?.["text"] ?? (imageUrl ? "مرفق" : "")),
      payload: message.body,
      createdAt: message.createdAt,
      status: "sent",
      ...(imageUrl ? { type: "image" as const, payload: { ...message.body, imageUrl } } : {}),
    };
  }, []);

  // Fetch initial paginated messages when threadId changes
  useEffect(() => {
    if (!threadId) {
      setServerMessages([]);
      setHasMore(false);
      setNextCursor(null);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const res = await api.threadMessages(threadId, { limit: 15 });
        if (!isMounted) return;
        setServerMessages(res.messages.map(mapServerMessage));
        setHasMore(res.hasMore ?? false);
        setNextCursor(res.nextCursor ?? null);
        if (typeof res.isOnline === "boolean") {
          setIsOnline(res.isOnline);
        }
        // Mark read
        void api.markThreadRead(threadId);
      } catch (err) {
        console.error("Failed to fetch initial thread messages", err);
      }
    })();

    // Heartbeat presence interval
    const presenceInterval = setInterval(() => {
      void api.sendPresence(threadId);
    }, 45_000);
    void api.sendPresence(threadId);

    return () => {
      isMounted = false;
      clearInterval(presenceInterval);
    };
  }, [threadId, mapServerMessage]);

  useChatRealtime({
    threadId: threadId || null,
    surface: "user",
    onMessageCreated: (rawMsg, clientMsgId) => {
      setServerMessages((prev) => {
        const existsById = prev.some((m) => m.id === rawMsg.id);
        if (existsById) return prev;

        const existingTempIndex = clientMsgId
          ? prev.findIndex((m) => m.clientMessageId === clientMsgId || m.id === clientMsgId)
          : -1;

        const mapped = mapServerMessage(rawMsg);
        if (existingTempIndex !== -1) {
          const copy = [...prev];
          copy[existingTempIndex] = { ...mapped, status: "sent" };
          return copy;
        }
        return [...prev, mapped];
      });

      const container = messagesContainerRef.current;
      if (container) {
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom > 150) {
          setUnreadCountBelow((c) => c + 1);
          setShowScrollBottomPill(true);
        } else {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        }
      }
    },
    onTypingUpdate: (typers) => {
      const isAnyAdminTyping = typers.some((t) => t.senderRole !== "user");
      setIsPeerTyping(isAnyAdminTyping);
    },
    onPresenceUpdate: (participants) => {
      // In customer chat, if we get an update, we assume admin is online
      setIsOnline(true);
    },
  });

  // Load older messages (Cursor Pagination with scroll preservation)
  const handleLoadOlder = async () => {
    if (!threadId || !nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);

    const container = messagesContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    try {
      const res = await api.threadMessages(threadId, { before: nextCursor, limit: 15 });
      const olderMapped = res.messages.map(mapServerMessage);

      setServerMessages((prev) => [...olderMapped, ...prev]);
      setHasMore(res.hasMore ?? false);
      setNextCursor(res.nextCursor ?? null);

      // Restore scroll offset so view doesn't jump
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

  // Debounced in-thread search
  useEffect(() => {
    if (!threadId || !isSearching || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const res = await api.searchThreadMessages(threadId, searchQuery.trim());
        setSearchResults(res.results || []);
      } catch (err) {
        console.error("In-thread search failed", err);
      } finally {
        setIsSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [threadId, isSearching, searchQuery]);

  // Jump to searched message
  const jumpToMessage = (msgId: string) => {
    setHighlightedMessageId(msgId);
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2500);
  };

  // Scroll listener for "Scroll to bottom" button
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      setShowScrollBottomPill(false);
      setUnreadCountBelow(0);
    }
  };

  // Emit typing indicator with debounce
  const handleInputChange = (val: string) => {
    setInputText(val);
    if (!threadId) return;

    if (!isSelfTyping) {
      setIsSelfTyping(true);
      void api.sendTyping(threadId, true);
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsSelfTyping(false);
      void api.sendTyping(threadId, false);
    }, 2500);
  };

  // Auto-scroll on initial load or new messages if near bottom
  useEffect(() => {
    if (!showScrollBottomPill) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverMessages.length, localMessages.length, isPeerTyping]);

  const messages: DisplayMessage[] = isHumanChat ? serverMessages : localMessages;

  const pushLocal = (message: DisplayMessage) => setLocalMessages((prev) => [...prev, message]);

  // Send message handler with optimistic UI
  const handleSend = async (customText?: string) => {
    const value = (customText !== undefined ? customText : inputText).trim();
    if (!value) return;

    setInputText("");
    if (threadId && isSelfTyping) {
      setIsSelfTyping(false);
      void api.sendTyping(threadId, false);
    }

    if (value === "تحدث مع الدعم" || value === "تحدث مع الإدارة" || value === "الدعم البشري") {
      void handleRequestHumanSupport();
      return;
    }

    if (isHumanChat && threadId) {
      const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimisticMsg: DisplayMessage = {
        id: clientMessageId,
        clientMessageId,
        sender: "user",
        text: value,
        createdAt: new Date().toISOString(),
        status: "sending",
      };

      setServerMessages((prev) => [...prev, optimisticMsg]);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

      try {
        const res = await api.sendMessage({
          threadId,
          text: value,
          clientMessageId,
          pageContext: {
            path: typeof window !== "undefined" ? window.location.pathname : "/chat",
          },
          viewHistory: viewHistoryForSupport(),
        });

        // Update optimistic item with confirmed message
        setServerMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...mapServerMessage(res.message), status: "sent" }
              : m,
          ),
        );

        const chips = (res.assistant?.body?.["suggestions"] as string[] | undefined) ?? [];
        if (chips.length) setSuggestions(chips);
      } catch (err) {
        setServerMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: "failed" } : m)),
        );
      }
      return;
    }

    // Local / Guest AI chat
    pushLocal({
      id: Date.now().toString(),
      sender: "user",
      text: value,
      createdAt: new Date().toISOString(),
      status: "sent",
    });
    setIsPeerTyping(true);

    const reply = supportAnswer(value, {
      products,
      orders,
      guides: (settings["guides"] as SupportContext["guides"]) ?? [],
      policies: (settings["policies"] as SupportContext["policies"]) ?? [],
      currencySymbol: activeCurrencyInfo?.symbol,
      ...(user?.name ? { userName: user.name } : {}),
    });

    setTimeout(() => {
      const stamp = Date.now();
      pushLocal({
        id: `${stamp}-ai`,
        sender: "ai",
        text: reply.text,
        createdAt: new Date().toISOString(),
        status: "sent",
      });
      reply.cards.forEach((card, index) => {
        if (card.kind === "product") {
          pushLocal({
            id: `${stamp}-card-${index}`,
            sender: "ai",
            text: card.text,
            type: "product",
            payload: { id: card.id, name: card.name, image: card.image ?? "" },
            createdAt: new Date().toISOString(),
            status: "sent",
          });
        } else if (card.kind === "image") {
          pushLocal({
            id: `${stamp}-card-${index}`,
            sender: "ai",
            text: card.text,
            type: "image",
            payload: { imageUrl: card.url },
            createdAt: new Date().toISOString(),
            status: "sent",
          });
        }
      });
      setIsPeerTyping(false);
      setSuggestions(
        reply.suggestions.length ? reply.suggestions : ["تصفح الألعاب", "تحدث مع الدعم"],
      );
    }, 350);
  };

  // Retry sending a failed message
  const handleRetry = async (msg: DisplayMessage) => {
    if (!threadId) return;
    setServerMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, status: "sending" } : m)),
    );
    try {
      const res = await api.sendMessage({
        threadId,
        text: msg.text,
        imageUrl: msg.payload?.imageUrl as string | undefined,
        clientMessageId: msg.clientMessageId || msg.id,
      });
      setServerMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...mapServerMessage(res.message), status: "sent" } : m,
        ),
      );
    } catch {
      setServerMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "failed" } : m)),
      );
    }
  };

  // Handle direct file attachment with real progress percentage
  const attachWithProgress = async (file: File) => {
    if (!file) return;
    setShowAttachments(false);

    const tempId = `upload-${Date.now()}`;
    const objectUrl = URL.createObjectURL(file);

    if (isHumanChat && threadId) {
      const optimisticMsg: DisplayMessage = {
        id: tempId,
        clientMessageId: tempId,
        sender: "user",
        text: "مرفق",
        type: "image",
        payload: { imageUrl: objectUrl },
        status: "sending",
        uploadProgress: 0,
        createdAt: new Date().toISOString(),
      };
      setServerMessages((prev) => [...prev, optimisticMsg]);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

      try {
        const { url } = await uploadFileWithProgress(file, "chat", (pct) => {
          setServerMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, uploadProgress: pct } : m)),
          );
        });

        const res = await api.sendMessage({
          threadId,
          imageUrl: url,
          text: "مرفق",
          clientMessageId: tempId,
        });

        setServerMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...mapServerMessage(res.message), status: "sent", uploadProgress: 100 }
              : m,
          ),
        );
      } catch (err) {
        setServerMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)),
        );
      }
    } else {
      pushLocal({
        id: tempId,
        sender: "user",
        text: "مرفق",
        type: "image",
        payload: { imageUrl: objectUrl },
        status: "sent",
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleSwitchToAutomatedSupport = async () => {
    if (!user) {
      setThreadId(undefined);
      return;
    }
    const existingAiThread = threads.find(
      (t) => t.chatType === "AUTOMATED_SUPPORT" && t.status === "open" && !t.orderId,
    );
    if (existingAiThread) {
      setThreadId(existingAiThread.id);
    } else {
      const res = await createThread.mutateAsync({
        subject: "محادثة المساعد الآلي",
        chatType: "AUTOMATED_SUPPORT",
      });
      if (res?.thread) {
        setThreadId(res.thread.id);
      }
    }
  };

  const handleRequestHumanSupport = async () => {
    if (!user) {
      pushLocal({
        id: Date.now().toString(),
        sender: "ai",
        text: "يرجى تسجيل الدخول أولاً للتحدث مع فريق الدعم والإدارة.",
      });
      return;
    }
    setIsPeerTyping(true);
    try {
      const res = await api.requestHumanSupport(threadId);
      if (res.isAvailable) {
        if (res.thread) {
          setThreadId(res.thread.id);
          void queryClient.invalidateQueries({ queryKey: ["threads"] });
        }
      } else {
        const stamp = Date.now();
        const offlineMsg =
          res.offlineMessage ||
          `فريق الدعم غير متاح حاليًا. ساعات العمل: ${res.workingHoursText || "09:00 ص - 11:00 م"} بتوقيت بغداد. يمكنك استخدام المساعد الآلي الآن، أو العودة خلال ساعات العمل.`;

        if (!isHumanChat) {
          pushLocal({
            id: `${stamp}-offline`,
            sender: "ai",
            text: offlineMsg,
            payload: { isOfflineNotice: true, action: "switch_to_automated_support" },
          });
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsPeerTyping(false);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (recordingState === "recording") {
      interval = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } else if (recordingState === "idle") {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingState]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const firstName = (user?.name ?? "بك").split(" ")[0];

  const isAutomatedThread = !threadId || currentThread?.chatType === "AUTOMATED_SUPPORT";

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#FCF9F5] via-[#F8EAE0] to-[var(--peach)] text-[var(--ink)]"
      dir="ltr"
    >
      {/* 1. Modern Compact Sticky Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/40 bg-[var(--surface-5)]/85 px-4 py-3 shadow-xs backdrop-blur-md transition-all">
        {/* Back Button */}
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-card/80 text-[var(--ink)] shadow-xs transition-colors hover:bg-[var(--surface-3)] cursor-pointer"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} />
        </button>

        {/* Thread Info & Live Status Badge */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1.5" dir="rtl">
            <span className="text-[14px] font-bold text-[var(--ink)]">
              {isAutomatedThread
                ? tr("الدعم الآلي")
                : currentThread?.subject || tr("محادثة الإدارة")}
            </span>
            {isAutomatedThread ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                <Sparkles className="h-3 w-3" />
                رد فوري
              </span>
            ) : isOnline ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {tr("متصل الآن")}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-stone-500/15 px-2 py-0.5 text-[10px] font-bold text-stone-600 dark:text-stone-400">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
                {tr("غير متصل")}
              </span>
            )}
          </div>
          {isPeerTyping && (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
            >
              {tr("يكتب الآن...")}
            </motion.span>
          )}
        </div>

        {/* Actions (Search + History) */}
        <div className="flex items-center gap-1.5">
          {isHumanChat && (
            <button
              onClick={() => setIsSearching(!isSearching)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-[var(--ink)] shadow-xs transition-colors cursor-pointer ${
                isSearching
                  ? "bg-[var(--ink)] text-white"
                  : "bg-card/80 hover:bg-[var(--surface-3)]"
              }`}
              title="بحث في المحادثة"
            >
              <Search className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-white/30 bg-card/80 px-3 text-[12px] font-bold text-[var(--ink)] shadow-xs transition-colors hover:bg-[var(--surface-3)] cursor-pointer"
            dir="rtl"
          >
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">{tr("المحادثات السابقة")}</span>
            {threads.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[9px] font-extrabold text-white">
                {threads.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* In-thread Search Bar */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 border-b border-[var(--line)] bg-[var(--surface-2)]/95 px-4 py-2.5 shadow-sm backdrop-blur-md"
            dir="rtl"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr("بحث في المحادثة...")}
                autoFocus
                className="h-10 w-full rounded-xl border border-[var(--line)] bg-card pl-9 pr-9 text-right text-xs font-medium text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
              />
              <Search className="absolute right-3 h-4 w-4 text-[var(--muted-ink)]" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute left-3 text-[var(--muted-ink)] hover:text-[var(--ink)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Results snippet list */}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-card p-1.5 shadow-sm">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => jumpToMessage(res.id)}
                    className="flex w-full flex-col rounded-lg p-2 text-right transition-colors hover:bg-[var(--surface-3)] cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--muted-ink)]">
                      <span>{res.senderRole === "user" ? "أنت" : "الدعم"}</span>
                      <span>
                        {new Date(res.createdAt).toLocaleTimeString("ar", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs font-medium text-[var(--ink)]">
                      {res.snippet}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {isSearching &&
              searchQuery.trim() &&
              !isSearchLoading &&
              searchResults.length === 0 && (
                <p className="mt-2 text-center text-xs text-[var(--muted-ink)]">
                  لا توجد نتائج مطابقة
                </p>
              )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Scrollable Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3 sm:px-6"
      >
        {/* Load older messages button / trigger */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
              className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-card/90 px-4 py-1.5 text-xs font-bold text-[var(--ink)] shadow-xs transition-all hover:bg-[var(--surface-3)] disabled:opacity-50 cursor-pointer"
            >
              {isLoadingOlder ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--ink)] border-t-transparent" />
                  <span>جاري التحميل...</span>
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5 text-[var(--muted-ink)]" />
                  <span>{tr("تحميل الرسائل السابقة")}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* 3. Hero Welcome Greeting (Only visible when thread has 0 messages, collapses smoothly) */}
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-4 pt-2"
            >
              <h1
                className="text-[32px] font-black leading-[1.2] tracking-[-0.03em] text-[var(--ink)] sm:text-[38px]"
                dir="rtl"
              >
                أهلاً{" "}
                <SquigglyText stepDuration={70} scale={[2, 4]} className="text-[var(--ink)]">
                  {firstName}
                </SquigglyText>
                <br />
                {tr("كيف أقدر أساعدك اليوم؟")}
              </h1>

              <div
                className="space-y-4 text-[15px] font-medium leading-[1.35] text-[var(--ink)]"
                dir="rtl"
              >
                <p>{tr("مرحباً بك في عالم بنانا")}</p>
                <div className="flex flex-wrap items-center">
                  هل تبحث عن{" "}
                  <FlipWords
                    words={["لعبة", "مجسم", "جهاز", "حل لمشكلة", "إكسسوار"]}
                    className="font-bold text-amber-600 px-1"
                  />
                  ؟
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Chat Messages */}
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            const isMine = msg.sender === "user";
            const isHighlighted = highlightedMessageId === msg.id;

            return (
              <motion.div
                id={`msg-${msg.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"} ${
                  isHighlighted ? "animate-pulse rounded-2xl ring-2 ring-amber-500 p-0.5" : ""
                }`}
              >
                {msg.type === "account_card" && msg.payload ? (
                  <AccountCard
                    kind={String(msg.payload["kind"] ?? "")}
                    body={msg.payload["body"] as Record<string, unknown>}
                  />
                ) : msg.type === "image" && msg.payload ? (
                  <div className="relative w-64 max-w-[85%] overflow-hidden rounded-2xl border border-[var(--surface-4)] bg-card p-1.5 shadow-xs">
                    <img
                      src={String(msg.payload["imageUrl"] ?? "")}
                      alt="مرفق"
                      className={`max-h-64 w-full rounded-[12px] object-cover ${
                        msg.status === "sending" ? "blur-[2px]" : ""
                      }`}
                    />
                    {msg.status === "sending" && typeof msg.uploadProgress === "number" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white backdrop-blur-xs">
                        <div className="relative h-12 w-12 flex items-center justify-center">
                          <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              stroke="rgba(255,255,255,0.3)"
                              strokeWidth="3"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeDasharray="94.2"
                              strokeDashoffset={94.2 - (94.2 * (msg.uploadProgress || 0)) / 100}
                              strokeLinecap="round"
                              className="transition-all duration-200"
                            />
                          </svg>
                          <span className="absolute text-[11px] font-black">
                            {msg.uploadProgress}%
                          </span>
                        </div>
                        <span className="mt-1 text-[10px] font-bold">جاري الرفع...</span>
                      </div>
                    )}
                    {msg.status === "failed" && (
                      <button
                        onClick={() => handleRetry(msg)}
                        className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/70 text-white cursor-pointer"
                      >
                        <RotateCcw className="h-6 w-6 mb-1" />
                        <span className="text-xs font-bold">{tr("إعادة المحاولة")}</span>
                      </button>
                    )}
                  </div>
                ) : msg.type === "product" && msg.payload ? (
                  <div className="group flex w-72 max-w-[85%] flex-col gap-3 rounded-2xl border border-[var(--surface-4)] bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
                    <div className="flex items-center gap-3" dir="rtl">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--surface-4)] bg-[var(--surface)]">
                        {msg.payload["image"] ? (
                          <img
                            src={String(msg.payload["image"])}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ShoppingBag className="h-7 w-7 text-[var(--ink)]" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-center text-right">
                        <span className="mb-0.5 line-clamp-1 text-[15px] font-bold leading-tight text-[var(--ink)]">
                          {String(msg.payload["name"] ?? "")}
                        </span>
                        <span className="inline-block w-max rounded-md bg-[var(--surface)] px-2 py-0.5 text-[12px] text-[var(--muted-ink)]">
                          {tr("منتج مقترح")}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-[var(--surface-4)]/50 pt-2 text-right text-[13px] leading-relaxed text-[var(--ink)]/80">
                      {msg.text}
                    </div>
                    <a
                      href={`/product/${String(msg.payload["id"] ?? "")}`}
                      className="mt-1 w-full rounded-xl bg-[var(--ink)] py-2 text-center text-[13px] font-bold text-white transition-colors hover:bg-[var(--ink-strong)]"
                    >
                      {tr("عرض التفاصيل")}
                    </a>
                  </div>
                ) : msg.type === "location" && msg.payload ? (
                  <div className="group w-72 max-w-[85%] rounded-2xl border border-[var(--surface-4)] bg-card p-1.5 shadow-xs transition-shadow hover:shadow-md">
                    <div className="relative mb-2 flex h-32 w-full items-center justify-center overflow-hidden rounded-[12px] bg-[var(--surface)] transition-colors group-hover:bg-[#F0EBE1]">
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      >
                        <MapPin className="relative z-10 h-10 w-10 text-blue-500 drop-shadow-md" />
                      </motion.div>
                    </div>
                    <div className="px-3 pb-3">
                      <div className="mb-0.5 text-right text-[15px] font-bold text-[var(--ink)]">
                        {String(msg.payload["name"] ?? "")}
                      </div>
                      <div className="mb-2 text-right text-[12px] leading-relaxed text-[var(--muted-ink)]">
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ) : msg.type === "wallet" && msg.payload ? (
                  <div
                    className="relative w-64 max-w-[85%] overflow-hidden rounded-3xl p-5 shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, #4A2B25 0%, var(--ink-strong) 100%)",
                    }}
                  >
                    <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/4 rounded-full bg-card/5 blur-xl" />
                    <div className="relative z-10 mb-5 flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-card/10 shadow-inner backdrop-blur-md">
                        <Wallet className="h-5 w-5 text-[var(--peach)]" />
                      </div>
                      <span className="rounded-lg border border-white/5 bg-card/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--peach)] shadow-xs backdrop-blur-xs">
                        {tr("تحويل رصيد")}
                      </span>
                    </div>
                    <div className="relative z-10 flex flex-col items-end gap-1">
                      <span className="text-[12px] font-medium tracking-wide text-white/70">
                        {tr("المبلغ المحول")}
                      </span>
                      <div className="flex flex-row-reverse items-baseline gap-1.5" dir="ltr">
                        <span className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
                          {String(msg.payload["amount"] ?? "")}
                        </span>
                        <span className="text-sm font-bold tracking-wide text-[var(--peach)]">
                          {activeCurrencyInfo?.symbol || "د.ع"}
                        </span>
                      </div>
                    </div>
                    <div className="relative z-10 mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="font-mono text-[10px] tracking-wider text-white/50">
                        REF: #{msg.id.slice(-5)}
                      </span>
                      <Check className="h-4 w-4 text-green-400 drop-shadow-xs" />
                    </div>
                  </div>
                ) : msg.payload?.isOfflineNotice ||
                  msg.payload?.action === "switch_to_automated_support" ? (
                  <div
                    dir="auto"
                    className="max-w-[85%] rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/30 p-4 text-[14px] text-[var(--ink)] shadow-xs space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed whitespace-pre-wrap font-medium">
                        {msg.text}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSwitchToAutomatedSupport}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--ink)] text-white font-bold text-xs hover:bg-[var(--ink-strong)] transition-all shadow-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>الانتقال إلى الرد الآلي</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1 max-w-[85%]">
                    <div
                      dir="auto"
                      className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[14.5px] font-medium leading-[1.4] shadow-xs ${
                        isMine
                          ? "rounded-tr-[4px] bg-[var(--ink)] text-[var(--surface-2)]"
                          : "rounded-tl-[4px] border border-white/50 bg-card/85 text-[var(--ink)] backdrop-blur-xs"
                      }`}
                    >
                      {msg.sender === "ai" ? (
                        <TextGenerateEffect
                          words={msg.text}
                          className="text-[var(--ink)]"
                          duration={0.3}
                        />
                      ) : (
                        msg.text
                      )}
                    </div>

                    {/* Timestamp & Status Checkmark */}
                    {isMine && (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--muted-ink)] px-1">
                        {msg.createdAt && (
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {msg.status === "sending" && (
                          <Clock className="h-3 w-3 animate-spin text-[var(--muted-ink)]" />
                        )}
                        {msg.status === "sent" && (
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        {msg.status === "failed" && (
                          <button
                            onClick={() => handleRetry(msg)}
                            className="flex items-center gap-0.5 text-red-500 font-bold hover:underline cursor-pointer"
                          >
                            <AlertCircle className="h-3 w-3" />
                            <span>{tr("إعادة المحاولة")}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Animated Typing Indicator */}
          {isPeerTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex max-w-[85%] items-center gap-1.5 rounded-2xl rounded-tl-[4px] border border-white/50 bg-card/80 px-4 py-3 text-[var(--ink)] shadow-xs backdrop-blur-xs">
                <span className="text-[12px] font-medium text-[var(--muted-ink)] ml-1">
                  {isAutomatedThread ? "المساعد الآلي يفكر" : "الدعم يكتب"}
                </span>
                {[0, 0.2, 0.4].map((delay) => (
                  <motion.div
                    key={delay}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay }}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]/60"
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Floating "Scroll to bottom / New messages" pill */}
      <AnimatePresence>
        {showScrollBottomPill && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              setShowScrollBottomPill(false);
              setUnreadCountBelow(0);
            }}
            className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/40 bg-[var(--ink)] px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition-transform hover:scale-105 cursor-pointer"
          >
            <ChevronDown className="h-4 w-4" />
            <span>{tr("رسائل جديدة بالأسفل")}</span>
            {unreadCountBelow > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-black">
                {unreadCountBelow}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* 4. Bottom Sheet Composer & Navigation Area */}
      <div className="relative z-10 mx-auto flex w-full shrink-0 flex-col gap-2.5 rounded-t-[28px] border-t border-white/80 bg-[var(--surface)] px-4 pb-4 pt-2 shadow-[0_-10px_40px_rgba(150,130,120,0.15)] sm:px-6">
        <div className="mx-auto text-[var(--line-2)]">
          <svg width="24" height="6" viewBox="0 0 24 12" fill="none">
            <path
              d="M4 3L12 7L20 3"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Dynamic Suggestions or Voice recording */}
        <AnimatePresence mode="wait">
          {recordingState !== "idle" ? (
            <motion.div
              key="recording-controls"
              initial={{ opacity: 0, y: 10, height: 0, overflow: "hidden" }}
              animate={{ opacity: 1, y: 0, height: "auto", overflow: "visible" }}
              exit={{
                opacity: 0,
                y: 10,
                height: 0,
                overflow: "hidden",
                transition: { duration: 0.2 },
              }}
              className="relative z-10 flex justify-end gap-2"
            >
              <button
                onClick={() => setRecordingState("idle")}
                className="flex items-center justify-center rounded-[14px] bg-red-50 px-3.5 py-1.5 text-red-500 shadow-xs transition-colors hover:bg-red-100 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  setRecordingState((prev) => (prev === "paused" ? "recording" : "paused"))
                }
                className="flex items-center justify-center rounded-[14px] border border-[var(--surface-4)] bg-[var(--surface-2)] px-3.5 py-1.5 text-[var(--ink)] shadow-xs transition-colors hover:bg-card cursor-pointer"
              >
                {recordingState === "paused" ? (
                  <Play className="ml-1 h-4 w-4" fill="currentColor" />
                ) : (
                  <Pause className="h-4 w-4" fill="currentColor" />
                )}
              </button>
              <button
                onClick={() => {
                  const label = `🎤 رسالة صوتية (${formatTime(recordingTime)})`;
                  setRecordingState("idle");
                  void handleSend(label);
                }}
                className="flex items-center justify-center gap-1.5 rounded-[14px] bg-[var(--ink)] px-4 py-1.5 text-[12px] font-medium text-white shadow-xs transition-colors hover:bg-[var(--ink-strong)] cursor-pointer"
              >
                <span>{tr("إرسال")}</span>
                <Send className="ml-0.5 h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : inputText.length === 0 ? (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, y: 10, height: 0, overflow: "hidden" }}
              animate={{ opacity: 1, y: 0, height: "auto", overflow: "visible" }}
              exit={{
                opacity: 0,
                y: 10,
                height: 0,
                overflow: "hidden",
                transition: { duration: 0.2 },
              }}
              className="relative z-10 flex flex-wrap justify-end gap-1.5"
            >
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-[14px] border border-[var(--surface-4)] bg-[var(--surface-2)] px-3 py-1 text-[12px] font-medium text-[var(--ink)] shadow-xs transition-colors hover:bg-card cursor-pointer"
                  dir="rtl"
                >
                  {suggestion}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Input Bar */}
        <div className="relative z-10 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attachWithProgress(file);
            }}
          />
          <div className="relative ml-1 flex items-center justify-center">
            <AnimatePresence>
              {showAttachments && (
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 30, scale: 0.8, transition: { duration: 0.2 } }}
                  className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 flex -translate-x-1/2 flex-col-reverse gap-3"
                >
                  {[
                    { icon: ImageIcon, color: "text-blue-500" },
                    { icon: Camera, color: "text-green-500" },
                    { icon: Paperclip, color: "text-purple-500" },
                  ].map(({ icon: Icon, color }, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * (i + 1) }}
                      onClick={() => fileRef.current?.click()}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--surface-4)] bg-card shadow-lg transition-colors hover:bg-[var(--surface)] cursor-pointer"
                    >
                      <Icon className={`h-4 w-4 ${color}`} />
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setShowAttachments(!showAttachments)}
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--surface-3)] cursor-pointer"
            >
              {showAttachments ? (
                <X className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Zap className="h-4 w-4 fill-transparent" strokeWidth={1.5} />
              )}
            </button>
          </div>

          <div className="relative flex h-[42px] flex-1 items-center overflow-hidden rounded-full border border-[var(--surface-4)] bg-[var(--surface-2)] shadow-xs transition-all focus-within:border-[#D4C3B3]">
            {recordingState !== "idle" ? (
              <div className="absolute inset-0 flex items-center justify-between px-4" dir="rtl">
                <div className="z-10 flex items-center gap-2 font-medium text-red-500">
                  <motion.div
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="h-2 w-2 rounded-full bg-red-500"
                  />
                  <span dir="ltr" className="text-[13px] font-semibold text-[var(--ink)]">
                    {formatTime(recordingTime)}
                  </span>
                </div>
                <span className="z-10 text-[12px] font-medium text-[var(--ink)] opacity-70">
                  {recordingState === "paused" ? "تم الإيقاف المؤقت" : "جاري التسجيل..."}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={inputText}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={isHumanChat ? "اكتب رسالتك للدعم..." : "اسألني أي شيء"}
                className="h-full w-full bg-transparent pl-4 pr-[44px] text-[13px] font-medium text-[var(--ink)] placeholder-[var(--muted-ink)] focus:outline-none"
              />
            )}
            <button
              onClick={() => {
                if (recordingState !== "idle") setRecordingState("idle");
                else if (inputText.length > 0) void handleSend();
                else setRecordingState("recording");
              }}
              className="absolute right-1 z-20 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--ink)] transition-colors hover:bg-[var(--ink-strong)] cursor-pointer"
            >
              {recordingState !== "idle" ? (
                <X className="h-4 w-4 text-white" strokeWidth={1.5} />
              ) : inputText.length > 0 ? (
                <Send className="ml-0.5 h-3.5 w-3.5 text-white" strokeWidth={2} />
              ) : (
                <Mic className="h-4 w-4 text-white" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {/* Bottom Fast Action Buttons */}
        <div
          className="relative z-10 mx-auto flex h-[85px] w-full max-w-md items-end justify-between px-2 pb-1"
          dir="rtl"
        >
          <AnimatePresence mode="wait">
            {recordingState !== "idle" ? (
              <motion.div
                key="recording-strands"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30, transition: { duration: 0.2 } }}
                className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-80"
              >
                <Strands
                  colors={["var(--ink)", "var(--peach)", "var(--line)"]}
                  count={3}
                  speed={recordingState === "recording" ? 1.5 : 0}
                  amplitude={recordingState === "recording" ? 1.5 : 0.2}
                  waviness={1}
                  thickness={1.5}
                  opacity={1}
                />
              </motion.div>
            ) : (
              <motion.div
                key="nav-icons"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30, transition: { duration: 0.2 } }}
                className="relative z-10 flex w-full items-end justify-between"
              >
                <button
                  onClick={() => setSelectedNav("المنتجات")}
                  className="group flex w-[64px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--ink)] transition-colors group-hover:bg-[var(--surface-3)]/50">
                    <ShoppingBag className="h-[17px] w-[17px]" strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-bold tracking-wide opacity-90">
                    {tr("المنتجات")}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setThreadId(undefined);
                    setLocalMessages([]);
                  }}
                  className="group flex w-[64px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--ink)] transition-colors group-hover:bg-[var(--surface-3)]/50">
                    <MessageSquarePlus className="h-[17px] w-[17px]" strokeWidth={1.75} />
                  </div>
                  <span className="whitespace-nowrap text-[11px] font-bold tracking-wide opacity-90">
                    {tr("جديد")}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (isHumanChat) {
                      void handleSwitchToAutomatedSupport();
                    } else {
                      void handleRequestHumanSupport();
                    }
                  }}
                  className="group relative flex w-[68px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[var(--ink)] text-white shadow-md transition-colors group-hover:bg-[var(--ink-strong)]">
                    {isHumanChat ? (
                      <Sparkles className="h-5 w-5" />
                    ) : (
                      <Headset className="h-5 w-5" />
                    )}
                  </div>
                  <span className="whitespace-nowrap text-[11px] font-bold tracking-wide">
                    {isHumanChat ? "الرد الآلي" : "الدعم البشري"}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedNav("الطلب")}
                  className="group flex w-[64px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--ink)] transition-colors group-hover:bg-[var(--surface-3)]/50">
                    <FileText className="h-[17px] w-[17px]" strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-bold tracking-wide opacity-90">
                    {tr("الطلب")}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedNav("الموقع")}
                  className="group flex w-[64px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--ink)] transition-colors group-hover:bg-[var(--surface-3)]/50">
                    <MapPin className="h-[17px] w-[17px]" strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-bold tracking-wide opacity-90">
                    {tr("الموقع")}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedNav("المحفظة")}
                  className="group flex w-[64px] shrink-0 flex-col items-center justify-end gap-1 text-[var(--ink)] cursor-pointer"
                >
                  <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--ink)] transition-colors group-hover:bg-[var(--surface-3)]/50">
                    <Wallet className="h-[17px] w-[17px]" strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-bold tracking-wide opacity-90">
                    {tr("المحفظة")}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Drawers / Modals */}
      <AnimatePresence>
        {selectedNav && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNav(null)}
              className="absolute inset-0 z-40 bg-black/40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 z-50 flex h-[75vh] max-h-[600px] flex-col overflow-hidden rounded-t-[28px] bg-card shadow-2xl"
            >
              <div className="flex h-full flex-col overflow-hidden rounded-t-[28px] border-t border-white/80 bg-[var(--surface)] p-6 pb-8">
                <div className="mx-auto mb-6 h-1.5 w-12 shrink-0 rounded-full bg-[var(--line-2)]" />

                <div className="flex-1 overflow-hidden">
                  {selectedNav === "المنتجات" && (
                    <ProductSelectionView
                      products={products}
                      favorites={user?.favorites ?? []}
                      purchased={purchased}
                      onSend={(product) => {
                        setSelectedNav(null);
                        const text = `أرغب بالاستفسار عن: ${String(product.title ?? "")}`;
                        if (isHumanChat) void handleSend(text);
                        else
                          pushLocal({
                            id: Date.now().toString(),
                            sender: "user",
                            text,
                            type: "product",
                            payload: {
                              name: String(product.title ?? ""),
                              id: product.id,
                              image: product.image,
                            },
                          });
                      }}
                    />
                  )}

                  {selectedNav === "الموقع" && (
                    <LocationSelectionView
                      addresses={user?.addresses ?? []}
                      onSend={(location) => {
                        setSelectedNav(null);
                        const text = `عنوان التوصيل: ${location}`;
                        if (isHumanChat) void handleSend(text);
                        else
                          pushLocal({
                            id: Date.now().toString(),
                            sender: "user",
                            text,
                            type: "location",
                            payload: { name: location },
                          });
                      }}
                    />
                  )}

                  {selectedNav === "المحفظة" && (
                    <WalletView
                      balance={spent}
                      onSend={(amount) => {
                        setSelectedNav(null);
                        if (amount === "topup_request") {
                          const text = "أرغب بتعبئة رصيد المحفظة";
                          if (isHumanChat) void handleSend(text);
                          else pushLocal({ id: Date.now().toString(), sender: "user", text });
                          return;
                        }
                        const text = `تحويل رصيد بقيمة ${amount}`;
                        if (isHumanChat) void handleSend(text);
                        else
                          pushLocal({
                            id: Date.now().toString(),
                            sender: "user",
                            text: "تحويل رصيد",
                            type: "wallet",
                            payload: { amount },
                          });
                      }}
                    />
                  )}

                  {selectedNav === "الطلب" && (
                    <OrderSelectionView
                      orders={orders}
                      onSend={(order) => {
                        setSelectedNav(null);
                        setThreadId(order.threadId);
                      }}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { delay: 0.3 } }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 z-40 bg-black/40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{
                x: "100%",
                transition: { delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 right-0 top-0 z-[45] w-[85%] bg-[var(--peach)] sm:w-[320px]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{
                x: "100%",
                transition: { delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="absolute bottom-0 right-0 top-0 z-[46] w-[85%] bg-[var(--line)] sm:w-[320px]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{
                x: "100%",
                transition: { delay: 0, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="absolute bottom-0 right-0 top-0 z-[50] flex w-[85%] flex-col bg-[var(--surface)] text-[var(--ink)] shadow-2xl sm:w-[320px]"
            >
              <div
                className="flex h-full flex-col space-y-4 overflow-y-auto border-l border-white/50 p-6"
                dir="rtl"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.4 }}
                  className="mb-6 flex items-center justify-between"
                >
                  <h2 className="text-xl font-bold text-[var(--ink)]">
                    {isAdmin ? "كل المحادثات" : "المحادثات السابقة"}
                  </h2>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="rounded-full bg-[var(--surface-3)] p-2 text-[var(--ink)] transition-colors hover:bg-[var(--line)] cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>

                <div className="space-y-3">
                  {threads.map((thread, idx) => {
                    const isAi = thread.chatType === "AUTOMATED_SUPPORT";
                    const isHuman = thread.chatType === "GENERAL_SUPPORT";
                    const isOrder = Boolean(thread.orderId) || thread.chatType === "ORDER_SUPPORT";
                    const isDelivery = thread.chatType === "DELIVERY";

                    return (
                      <motion.button
                        key={thread.id}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                        transition={{
                          delay: 0.4 + idx * 0.06,
                          duration: 0.4,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        onClick={() => {
                          setShowHistory(false);
                          setThreadId(thread.id);
                        }}
                        className={`group flex w-full items-center justify-between rounded-xl border p-4 text-right shadow-xs transition-colors cursor-pointer ${
                          threadId === thread.id
                            ? "border-[var(--ink)] bg-[var(--surface-3)]/60"
                            : "border-[var(--surface-4)] bg-card hover:border-[var(--line)]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="truncate text-[15px] font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--ink-strong)]">
                              {thread.subject || (isAi ? "المساعد الآلي" : "محادثة الدعم")}
                            </h3>
                          </div>
                          <p className="truncate text-[12px] text-[var(--muted-ink)]">
                            {isAdmin ? `${thread.userName} · ` : ""}
                            {thread.lastMessagePreview ??
                              new Date(thread.lastMessageAt).toLocaleString("ar")}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isAdmin && thread.needsAdmin ? (
                            <span className="rounded-md bg-[var(--danger,#dc2626)] px-2 py-1 text-[10px] font-bold text-white">
                              يحتاج ردك
                            </span>
                          ) : null}
                          <span
                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold ${
                              isAi
                                ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                                : isHuman
                                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                                  : isDelivery
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            }`}
                          >
                            {isAi
                              ? "🤖 مساعد آلي"
                              : isHuman
                                ? "👤 دعم الإدارة"
                                : isDelivery
                                  ? "⚡ تسليم"
                                  : "📦 طلب"}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                  {threads.length === 0 && (
                    <p className="text-sm text-[var(--muted-ink)]">
                      {tr("لا توجد محادثات سابقة.")}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
