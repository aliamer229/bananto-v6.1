import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DELIVERY_OTP_TTL_MINUTES } from "@/lib/delivery-otp";
import {
  Key,
  ShieldCheck,
  Sparkles,
  Send,
  X,
  Copy,
  Check,
  CreditCard,
  Ticket,
  ClipboardPaste,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Gamepad2,
  Layers,
  ChevronRight,
  ArrowLeft,
  Lock,
  Plus,
  Trash2,
  Clock,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseAccountPaste,
  parseAccountLine,
  matchAccountsToOrder,
  type ParsedAccountLine,
  type OrderItemMatchTarget,
  type MatchedAccountResult,
} from "@/lib/account-paste";
import { Order, OrderItem } from "@/lib/types";
import { adminApi, type DeliveryLine } from "@/lib/api";
import { summarizeDeliveryProgress } from "@/lib/delivery-items";
import {
  ORDER_ITEM_TITLE_UNAVAILABLE_AR,
  orderItemTitleOf,
  resolveOrderTitles,
  unresolvedTitleIds,
} from "@/lib/order-item-title";

export interface AccountToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  defaultTab?: "credentials" | "card" | "otp" | "instructions";
  onSendCredentials: (payload: {
    platform?: string;
    email: string;
    password?: string;
    title?: string;
    itemId?: string;
    slot?: number;
  }) => void;
  onSendVerificationCode: (payload: {
    code: string;
    expiresInMinutes?: number;
    itemId?: string;
    title?: string;
  }) => void;
  onSendCardCode?: (payload: {
    cardType: string;
    code: string;
    pin?: string;
    instructions?: string;
    itemId?: string;
  }) => void;
  onCompleteOrder?: (orderId: string) => void | Promise<void>;
}

export interface StagedAccountState {
  id: string;
  username: string;
  password: string;
  label?: string;
  matchedItemId?: string;
  matchedItemTitle?: string;
  slotNumber?: number;
  isSent?: boolean;
  /**
   * The parser could not tell which game this account is for.
   *
   * It stays true until an admin picks the game, and nothing can be sent while
   * it is. Guessing here is how one account ends up delivered as every game on
   * a four-game order.
   */
  needsMapping?: boolean;
}

export function AccountToolsModal({
  isOpen,
  onClose,
  order,
  defaultTab = "credentials",
  onSendCredentials,
  onSendVerificationCode,
  onSendCardCode,
  onCompleteOrder,
}: AccountToolsModalProps) {
  // 1. Analyze order items to determine mode & slots
  const orderItems: OrderItem[] = useMemo(() => order?.items || [], [order]);

  const hasCodeItems = useMemo(
    () =>
      orderItems.some(
        (i) =>
          i.kind === "digital_code" ||
          (i.kind as string) === "code" ||
          (i.kind as string) === "gift_card",
      ),
    [orderItems],
  );

  const hasAccountItems = useMemo(
    () => orderItems.some((i) => i.kind === "account" || !i.kind),
    [orderItems],
  );

  // Determine initial mode: "account" vs "card"
  const initialMode = useMemo(() => {
    if (defaultTab === "card" || (hasCodeItems && !hasAccountItems)) {
      return "card";
    }
    return "account";
  }, [defaultTab, hasCodeItems, hasAccountItems]);

  const [mode, setMode] = useState<"account" | "card">(initialMode);

  // Targets for matching
  const matchTargets: OrderItemMatchTarget[] = useMemo(() => {
    return orderItems.map((item) => ({
      id: item.id,
      title: orderItemTitleOf(item),
      quantity: item.quantity || 1,
      kind: item.kind,
    }));
  }, [orderItems]);

  /*
    An order whose items cannot be named is a data problem the admin needs to
    see before they deliver anything, not something to paper over with a
    placeholder. Logged with ids only — an order item carries the account it
    was delivered with.
  */
  const unnamedItems = useMemo(
    () => unresolvedTitleIds(resolveOrderTitles(orderItems)),
    [orderItems],
  );
  useEffect(() => {
    if (unnamedItems.length > 0) {
      console.warn("[delivery-tool:order_items_unnamed]", {
        orderId: order?.id ?? null,
        unresolved: unnamedItems,
      });
    }
  }, [unnamedItems, order?.id]);

  // Expand order items into individual deliverable slots (e.g. quantity 2 = Slot 1 & Slot 2)
  const deliverableSlots = useMemo(() => {
    const slots: {
      slotKey: string;
      itemId: string;
      title: string;
      slotIndex: number;
      totalSlots: number;
      originalItem: OrderItem;
    }[] = [];

    orderItems.forEach((item) => {
      const qty = Math.max(item.quantity || 1, 1);
      for (let s = 1; s <= qty; s++) {
        slots.push({
          slotKey: `${item.id}-${s}`,
          itemId: item.id,
          title: orderItemTitleOf(item),
          slotIndex: s,
          totalSlots: qty,
          originalItem: item,
        });
      }
    });

    return slots;
  }, [orderItems]);

  // ==========================
  // ACCOUNT MODE STATE
  // ==========================
  const [quickPasteInput, setQuickPasteInput] = useState("");
  const [stagedAccounts, setStagedAccounts] = useState<StagedAccountState[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState<number>(0);

  // Current active account fields for direct editing
  const [selectedGameTitle, setSelectedGameTitle] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedSlotNumber, setSelectedSlotNumber] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);

  // Integrated OTP state for active item/account
  const [otpCode, setOtpCode] = useState("");
  const [isOtpSectionOpen, setIsOtpSectionOpen] = useState(false);

  // Copied state for feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  /*
    ============================================================
    Drafts live in D1, not in this component.

    Everything typed here used to exist only in React state, so a refresh, a
    closed tab, or a second admin opening the same order lost it — and there
    was no way to answer "which of these four lines has actually been sent?"
    except by reading timestamps scattered across the order items. The rows
    below are the source of truth; this modal renders them and writes back to
    them as the admin types.
    ============================================================
  */
  const [deliveryLines, setDeliveryLines] = useState<DeliveryLine[]>([]);
  const draftTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /**
   * How many of the order's slots have had their credentials sent.
   *
   * The admin needs "2 of 4 done" at a glance on a multi-game order; the
   * ribbon only ever showed how many items existed.
   */
  const preparedSlotCount = useMemo(() => {
    // Prefer what D1 says; fall back to the order's own timestamps when the
    // delivery rows have not loaded (or D1 is not bound at all).
    if (deliveryLines.length > 0) {
      return summarizeDeliveryProgress(deliveryLines, deliverableSlots.length).delivered;
    }
    return deliverableSlots.filter(
      (slot) => slot.originalItem.credsSentAt || slot.originalItem.completedAt,
    ).length;
  }, [deliverableSlots, deliveryLines]);

  const reloadDeliveryLines = useCallback(async () => {
    if (!order?.id) return;
    try {
      const res = await adminApi.deliveryItems(order.id);
      setDeliveryLines(res.items ?? []);
    } catch (err) {
      // The tool still works from the order alone; the draft is just not
      // restored. Log the id only — a line carries the account password.
      console.warn("[delivery-tool:draft_load_failed]", { orderId: order.id }, err);
    }
  }, [order?.id]);

  useEffect(() => {
    if (!isOpen) return;
    void reloadDeliveryLines();
  }, [isOpen, reloadDeliveryLines]);

  /** Autosave one line, debounced, so typing does not write on every keystroke. */
  const queueDraftSave = useCallback(
    (itemId: string, draft: { username: string; password: string; needsMapping?: boolean }) => {
      if (!order?.id || !itemId) return;
      const timers = draftTimersRef.current;
      if (timers[itemId]) clearTimeout(timers[itemId]);
      timers[itemId] = setTimeout(() => {
        delete timers[itemId];
        const productId = order.items?.find((entry) => entry.id === itemId)?.productId;
        void adminApi
          .saveDeliveryDraft({
            orderId: order.id,
            itemId,
            productId: productId === undefined ? null : String(productId),
            username: draft.username,
            password: draft.password,
            ...(draft.needsMapping === undefined ? {} : { needsMapping: draft.needsMapping }),
          })
          .then((res) => {
            if (!res.item) return;
            setDeliveryLines((prev) => {
              const next = prev.filter((line) => line.itemId !== itemId);
              const existing = prev.find((line) => line.itemId === itemId);
              return [...next, { ...(existing ?? ({} as DeliveryLine)), ...res.item! }];
            });
          })
          .catch((err) => {
            console.warn("[delivery-tool:draft_save_failed]", { orderId: order.id, itemId }, err);
          });
      }, 700);
    },
    [order?.id, order?.items],
  );

  // Flush nothing on unmount — a pending timer would write after the modal is
  // gone; the next open reads the last saved state instead.
  useEffect(() => {
    const timers = draftTimersRef.current;
    return () => {
      for (const id of Object.keys(timers)) clearTimeout(timers[id]!);
    };
  }, []);

  // ==========================
  // CARD / ACTIVATION CODE STATE
  // ==========================
  const [cardTitle, setCardTitle] = useState(orderItems[0]?.title || "بطاقة رقمية");
  const [cardItemId, setCardItemId] = useState(orderItems[0]?.id || "");
  const [cardCode, setCardCode] = useState("");
  const [cardPin, setCardPin] = useState("");
  const [showPinField, setShowPinField] = useState(false);

  // Initialize active item from order if available
  useEffect(() => {
    if (orderItems.length > 0) {
      const firstItem = orderItems[0]!;
      setSelectedGameTitle(orderItemTitleOf(firstItem));
      setSelectedItemId(firstItem.id);
      setSelectedSlotNumber(1);
      setCardTitle(orderItemTitleOf(firstItem));
      setCardItemId(firstItem.id);

      // Check if any item already has credentials sent or login proof
      const itemNeedingOtp = orderItems.find((i) => i.credsSentAt && !i.completedAt);
      if (itemNeedingOtp) {
        setIsOtpSectionOpen(true);
      }
    }
  }, [orderItems]);

  // Sync active account fields when selecting another staged account
  useEffect(() => {
    if (stagedAccounts.length > 0 && stagedAccounts[selectedAccountIndex]) {
      const acc = stagedAccounts[selectedAccountIndex]!;
      setUsername(acc.username);
      setPassword(acc.password);
      /*
        Clear, do not keep. Leaving the previous account's game on screen when
        the newly selected one has none is how an admin sends the right
        credentials under the wrong game.
      */
      setSelectedGameTitle(acc.matchedItemTitle ?? "");
      setSelectedItemId(acc.matchedItemId ?? "");
      setSelectedSlotNumber(acc.slotNumber ?? 1);
    }
  }, [selectedAccountIndex, stagedAccounts]);

  if (!isOpen) return null;

  // ==========================
  // QUICK PASTE HANDLER
  // ==========================
  const handleQuickPasteChange = (text: string) => {
    setQuickPasteInput(text);
    if (!text.trim()) {
      return;
    }

    const { accounts } = parseAccountPaste(text);
    if (accounts.length === 0) return;

    // Match parsed accounts to order items
    const matched = matchAccountsToOrder(accounts, matchTargets);

    /*
      A failed match stays a failed match.

      This used to fall through `m.matchedItemId || positional slot ||
      orderItems[0].id`, so when the parser could not tell which game a line
      was for the tool quietly assigned it anyway — by position, or, on a paste
      the parser understood least, to the first game for every line. On a
      four-game order that is one account delivered as all four games. An
      account with no game is now marked `needsMapping` and the admin picks the
      game; nothing about it can be sent until they do.
    */
    const newStaged: StagedAccountState[] = matched.map((m, idx) => ({
      id: `staged-${Date.now()}-${idx}`,
      username: m.account.username,
      password: m.account.password,
      label: m.account.label,
      ...(m.matchedItemId
        ? {
            matchedItemId: m.matchedItemId,
            matchedItemTitle: m.matchedItemTitle,
            slotNumber: m.slotNumber || 1,
          }
        : { needsMapping: true }),
      isSent: false,
    }));

    setStagedAccounts(newStaged);
    // Start on the first account that still needs a decision, if there is one.
    const firstUnmapped = newStaged.findIndex((acc) => acc.needsMapping);
    setSelectedAccountIndex(firstUnmapped === -1 ? 0 : firstUnmapped);

    const first = newStaged[firstUnmapped === -1 ? 0 : firstUnmapped];
    if (first) {
      setUsername(first.username);
      setPassword(first.password);
      setSelectedGameTitle(first.matchedItemTitle ?? "");
      setSelectedItemId(first.matchedItemId ?? "");
      setSelectedSlotNumber(first.slotNumber ?? 1);
    }

    const unmappedCount = newStaged.filter((acc) => acc.needsMapping).length;
    if (unmappedCount > 0) {
      toast.warning(
        `تم استخراج ${newStaged.length} حساب، و${unmappedCount} منها بحاجة لتحديد اللعبة يدويًا`,
      );
    } else {
      toast.success(`تم استخراج ${newStaged.length} حساب ومطابقتها مع عناصر الطلب`);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleQuickPasteChange(text);
      }
    } catch {
      toast.error("يرجى لصق النص داخل المربع يدوياً");
    }
  };

  const generateStrongPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let gen = "";
    for (let i = 0; i < 10; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(gen);
    // update current staged account if exists
    if (stagedAccounts[selectedAccountIndex]) {
      const copy = [...stagedAccounts];
      copy[selectedAccountIndex] = { ...copy[selectedAccountIndex]!, password: gen };
      setStagedAccounts(copy);
    }
    toast.success("تم توليد كلمة مرور جديدة");
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Assign an order item / game to current staged account
  const handleAssignGameToActive = (item: OrderItem, slotNumber = 1) => {
    setSelectedGameTitle(orderItemTitleOf(item));
    setSelectedItemId(item.id);
    setSelectedSlotNumber(slotNumber);

    /*
      Restore whatever was already prepared for this line. Without it, clicking
      through the ribbon on a part-finished order shows empty fields for lines
      that already have credentials waiting — and the admin retypes them.
    */
    const saved = deliveryLines.find((line) => line.itemId === item.id);
    if (saved && (saved.username || saved.password) && !username && !password) {
      setUsername(saved.username);
      setPassword(saved.password);
    } else if (username || password) {
      // Persist the pairing the admin just made.
      queueDraftSave(item.id, { username, password, needsMapping: false });
    }

    if (stagedAccounts[selectedAccountIndex]) {
      const copy = [...stagedAccounts];
      copy[selectedAccountIndex] = {
        ...copy[selectedAccountIndex]!,
        matchedItemId: item.id,
        matchedItemTitle: orderItemTitleOf(item),
        slotNumber,
        // The admin has now said which game this is.
        needsMapping: false,
      };
      setStagedAccounts(copy);
    }
  };

  // Send single account
  const handleSendCurrentAccount = () => {
    if (!username.trim() || !password.trim()) {
      toast.error("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    /*
      An account has to belong to a specific item on the order before it can go
      out. Without this the tool would happily deliver credentials with no
      `itemId`, which nothing downstream can attribute to a game — the customer
      gets a login and no idea what it opens, and the order can never be marked
      complete because no item was.
    */
    if (!selectedItemId) {
      toast.error("اختر اللعبة التي يخص هذا الحساب أولًا");
      return;
    }

    onSendCredentials({
      title: selectedGameTitle.trim() || undefined,
      email: username.trim(),
      password: password.trim(),
      itemId: selectedItemId,
      slot: selectedSlotNumber,
    });

    /*
      Record the transition on the row itself. `sendKey` is derived from the
      order, the line and the credentials, so a retried request — a
      double-clicked button, a reconnecting client replaying its last action —
      is recognised as the same send rather than a second one.
    */
    if (order?.id) {
      void adminApi
        .markDeliverySent({
          orderId: order.id,
          itemId: selectedItemId,
          sendKey: `${order.id}:${selectedItemId}:${username.trim()}`,
        })
        .then(() => reloadDeliveryLines())
        .catch((err) => {
          console.warn(
            "[delivery-tool:mark_sent_failed]",
            { orderId: order.id, itemId: selectedItemId },
            err,
          );
        });
    }

    // Mark current staged as sent
    if (stagedAccounts[selectedAccountIndex]) {
      const copy = [...stagedAccounts];
      copy[selectedAccountIndex] = { ...copy[selectedAccountIndex]!, isSent: true };
      setStagedAccounts(copy);

      // If there are more unsent staged accounts, advance to next
      const nextUnsentIndex = copy.findIndex((s, i) => i > selectedAccountIndex && !s.isSent);
      if (nextUnsentIndex !== -1) {
        setSelectedAccountIndex(nextUnsentIndex);
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Send all matched accounts
  const handleSendAllStagedAccounts = () => {
    if (stagedAccounts.length === 0) return;

    /*
      "Send all" means all the ones that are actually ready. An account still
      waiting on a game is skipped and reported, never sent under whichever
      game happened to be selected in the form — that is the bug this whole
      screen is here to stop.
    */
    const ready = stagedAccounts.filter(
      (acc) => acc.username && acc.password && !acc.isSent && acc.matchedItemId,
    );
    const blocked = stagedAccounts.filter(
      (acc) => !acc.isSent && (!acc.matchedItemId || acc.needsMapping),
    );

    if (ready.length === 0) {
      toast.error("لا يوجد حساب جاهز للإرسال — حدد اللعبة لكل حساب أولًا");
      return;
    }

    const sentIds = new Set<string>();
    ready.forEach((acc, idx) => {
      onSendCredentials({
        title: acc.matchedItemTitle || undefined,
        email: acc.username,
        password: acc.password,
        itemId: acc.matchedItemId!,
        slot: acc.slotNumber || idx + 1,
      });
      sentIds.add(acc.id);
    });
    setStagedAccounts((prev) =>
      prev.map((acc) => (sentIds.has(acc.id) ? { ...acc, isSent: true } : acc)),
    );

    if (blocked.length > 0) {
      toast.warning(`تم إرسال ${ready.length} حساب، وبقي ${blocked.length} بانتظار تحديد اللعبة`);
      // Stay open: there is still work on this order.
      const nextUnmapped = stagedAccounts.findIndex((acc) => !acc.isSent && !acc.matchedItemId);
      if (nextUnmapped !== -1) setSelectedAccountIndex(nextUnmapped);
      return;
    }

    toast.success(`تم إرسال ${ready.length} حساب للعميل`);
    onClose();
  };

  // Send OTP
  const handleSendOtp = () => {
    if (!otpCode.trim()) {
      toast.error("يرجى إدخال كود التحقق OTP");
      return;
    }

    // The code is for one item on the order; unattributed it cannot complete one.
    if (!selectedItemId) {
      toast.error("اختر اللعبة التي يخص هذا الكود أولًا");
      return;
    }

    onSendVerificationCode({
      code: otpCode.trim(),
      expiresInMinutes: DELIVERY_OTP_TTL_MINUTES,
      itemId: selectedItemId,
      title: selectedGameTitle || undefined,
    });

    if (order?.id) {
      void adminApi
        .markDeliveryOtpSent({ orderId: order.id, itemId: selectedItemId })
        .then(() => reloadDeliveryLines())
        .catch((err) => {
          console.warn(
            "[delivery-tool:mark_otp_failed]",
            { orderId: order.id, itemId: selectedItemId },
            err,
          );
        });
    }

    setOtpCode("");
    setIsOtpSectionOpen(false);
    onClose();
  };

  // Send Code / Card
  const handleSendCard = () => {
    if (!cardCode.trim()) {
      toast.error("يرجى إدخال كود البطاقة أو التفعيل");
      return;
    }

    if (onSendCardCode) {
      onSendCardCode({
        cardType: cardTitle.trim() || "بطاقة رقمية",
        code: cardCode.trim(),
        pin: cardPin.trim() || undefined,
        itemId: cardItemId || undefined,
      });
    } else {
      onSendVerificationCode({
        code: cardCode.trim(),
        itemId: cardItemId || undefined,
        title: cardTitle.trim(),
      });
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-card border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {mode === "account" ? <Key className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  {mode === "account" ? "أداة تسليم الحسابات" : "أداة تسليم الأكواد والبطاقات"}
                </h3>
                {order && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold text-muted-foreground border border-border/50">
                    طلب #{order.code || order.id.slice(-6)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {mode === "account"
                  ? "لصق سريع، مطابقة الألعاب، وتوليد بطاقة التسليم الفورية"
                  : "إرسال كود التفعيل أو البطاقة الرقمية مباشرة للعميل"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mode Switcher pill */}
            <div className="flex items-center p-0.5 bg-muted rounded-lg border border-border/60 text-xs">
              <button
                type="button"
                onClick={() => setMode("account")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  mode === "account"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                حساب
              </button>
              <button
                type="button"
                onClick={() => setMode("card")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  mode === "card"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                كود / بطاقة
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* ========================================================================= */}
          {/* MODE 1: ACCOUNT MODE                                                     */}
          {/* ========================================================================= */}
          {mode === "account" && (
            <div className="space-y-5">
              {/* 1. Quick Paste Box */}
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <ClipboardPaste className="w-4 h-4 text-amber-500" />
                    <span>اللصق السريع (Quick Paste)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card hover:bg-muted text-[11px] font-bold text-foreground border border-border shadow-2xs transition-colors"
                  >
                    <ClipboardPaste className="w-3 h-3 text-amber-500" />
                    <span>لصق من الحافظة</span>
                  </button>
                </div>

                <textarea
                  value={quickPasteInput}
                  onChange={(e) => handleQuickPasteChange(e.target.value)}
                  placeholder="الصق سطر الحساب أو عدة أسطر مباشرة هنا...&#10;مثال: ttxx7834 密码 a8dqq9sr 运动switch&#10;أو: 游戏 FC26 账号 user@mail.com 密码 pass123"
                  rows={2}
                  className="w-full p-2.5 text-xs bg-background border border-border/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 text-foreground font-mono leading-relaxed resize-y max-h-32"
                  dir="ltr"
                />

                {stagedAccounts.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تم استخراج {stagedAccounts.length} حساب جاهز للمراجعة والتسليم</span>
                    </div>
                    {stagedAccounts.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSendAllStagedAccounts}
                        className="text-amber-700 dark:text-amber-400 font-bold hover:underline"
                      >
                        إرسال الكل ({stagedAccounts.length})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Order Games Horizontal Ribbon (شريط الألعاب الموجودة في الطلب) */}
              {deliverableSlots.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-bold">
                    <span className="flex items-center gap-1">
                      <Gamepad2 className="w-3.5 h-3.5 text-primary" />
                      <span>الألعاب والعناصر في هذا الطلب:</span>
                    </span>
                    <span className="text-[10px] opacity-75">
                      تم تجهيز {preparedSlotCount} / {deliverableSlots.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
                    {deliverableSlots.map((slot) => {
                      const isSelected =
                        selectedItemId === slot.itemId && selectedSlotNumber === slot.slotIndex;
                      const hasCreds = Boolean(slot.originalItem.credsSentAt);
                      const hasProof = Boolean(slot.originalItem.loginProofUrl);
                      const isDone = Boolean(slot.originalItem.completedAt);

                      return (
                        <button
                          key={slot.slotKey}
                          type="button"
                          onClick={() =>
                            handleAssignGameToActive(slot.originalItem, slot.slotIndex)
                          }
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border shrink-0 transition-all text-right ${
                            isSelected
                              ? "bg-primary/10 border-primary/40 text-primary shadow-xs"
                              : "bg-muted/40 hover:bg-muted border-border text-foreground"
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[180px]">{slot.title}</span>
                              {slot.totalSlots > 1 && (
                                <span className="text-[10px] px-1 rounded-sm bg-muted text-muted-foreground">
                                  #{slot.slotIndex}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-normal opacity-70">
                              {isDone
                                ? "✓ مكتمل"
                                : hasProof
                                  ? "📸 أرفق الإثبات"
                                  : hasCreds
                                    ? "⏳ تم إرسال الحساب"
                                    : "جاهز للتجهيز"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Multi-Account Staged Selector (if multiple lines parsed) */}
              {stagedAccounts.length > 1 && (
                <div className="space-y-1.5 p-2.5 rounded-xl bg-muted/30 border border-border">
                  <div className="text-[11px] font-bold text-muted-foreground flex items-center justify-between">
                    <span>اختر الحساب المراد تعديله أو إرساله:</span>
                    <span className="text-foreground">
                      {selectedAccountIndex + 1} من {stagedAccounts.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {stagedAccounts.map((acc, idx) => {
                      const isCurr = idx === selectedAccountIndex;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountIndex(idx)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                            isCurr
                              ? "bg-foreground text-background shadow-xs"
                              : acc.isSent
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-card text-foreground border border-border hover:bg-muted"
                          }`}
                        >
                          <span>الحساب {idx + 1}</span>
                          {acc.matchedItemTitle ? (
                            <span className="text-[10px] opacity-80 truncate max-w-[100px]">
                              ({acc.matchedItemTitle})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              بحاجة لتحديد اللعبة
                            </span>
                          )}
                          {acc.isSent && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3 & 4 & 5. Account Details Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/*
                  3. Game — shown, not typed.

                  This was a free text field, so the name that went out with the
                  credentials was whatever the admin had left in the box. It now
                  reads back the item picked in the ribbon above, resolved from
                  the order's own items, and says so plainly when nothing is
                  picked yet.
                */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">
                    اللعبة أو المنتج (من عناصر الطلب)
                  </label>
                  <div
                    className={`flex items-center gap-2 w-full px-3 py-2 text-xs rounded-xl border ${
                      selectedItemId
                        ? "bg-muted/40 border-border text-foreground"
                        : "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400"
                    }`}
                    aria-live="polite"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-bold truncate">
                      {selectedItemId
                        ? selectedGameTitle || ORDER_ITEM_TITLE_UNAVAILABLE_AR
                        : "اختر اللعبة من الشريط أعلاه"}
                    </span>
                    {selectedItemId && selectedSlotNumber > 1 && (
                      <span className="text-[10px] px-1 rounded-sm bg-muted text-muted-foreground shrink-0">
                        #{selectedSlotNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Username / Email */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">
                      البريد الإلكتروني / اسم المستخدم
                    </label>
                    {username && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(username, "اسم المستخدم")}
                        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-bold"
                      >
                        {copiedKey === "اسم المستخدم" ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>نسخ</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (stagedAccounts[selectedAccountIndex]) {
                        const copy = [...stagedAccounts];
                        copy[selectedAccountIndex] = {
                          ...copy[selectedAccountIndex]!,
                          username: e.target.value,
                        };
                        setStagedAccounts(copy);
                      }
                      if (selectedItemId) {
                        queueDraftSave(selectedItemId, {
                          username: e.target.value,
                          password,
                          needsMapping: false,
                        });
                      }
                    }}
                    placeholder="e.g. user@xiaohu666.com أو login_id"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    dir="ltr"
                  />
                </div>

                {/* 5. Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">كلمة المرور</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={generateStrongPassword}
                        className="text-[10px] text-primary hover:underline font-bold inline-flex items-center gap-0.5"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>توليد</span>
                      </button>
                      {password && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(password, "كلمة المرور")}
                          className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-bold"
                        >
                          {copiedKey === "كلمة المرور" ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>نسخ</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (stagedAccounts[selectedAccountIndex]) {
                          const copy = [...stagedAccounts];
                          copy[selectedAccountIndex] = {
                            ...copy[selectedAccountIndex]!,
                            password: e.target.value,
                          };
                          setStagedAccounts(copy);
                        }
                        if (selectedItemId) {
                          queueDraftSave(selectedItemId, {
                            username,
                            password: e.target.value,
                            needsMapping: false,
                          });
                        }
                      }}
                      placeholder="e.g. qw83150220"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 6. Live Delivery Card Preview (معاينة بطاقة التسليم) */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground block">
                  معاينة بطاقة التسليم الفعلية (كما ستظهر للعميل):
                </span>
                <div className="p-4 rounded-2xl border border-border bg-card shadow-2xs max-w-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-foreground">معلومات الحساب</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      جاهز للتسجيل
                    </span>
                  </div>

                  {selectedGameTitle && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Gamepad2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate">{selectedGameTitle}</span>
                    </div>
                  )}

                  <div className="space-y-2 text-xs">
                    <div className="p-2 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-foreground block">
                          اسم المستخدم:
                        </span>
                        <span
                          className="font-mono font-bold text-foreground select-all truncate block"
                          dir="ltr"
                        >
                          {username || "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(username, "اسم المستخدم")}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-2 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-foreground block">
                          كلمة المرور:
                        </span>
                        <span
                          className="font-mono font-bold text-foreground select-all truncate block"
                          dir="ltr"
                        >
                          {password || "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(password, "كلمة المرور")}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Integrated OTP Trigger (كود التحقق في دورة بيانات الحساب) */}
              <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    <span>كود التحقق (OTP) لهذا الحساب</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOtpSectionOpen(!isOtpSectionOpen)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                  >
                    {isOtpSectionOpen ? "إخفاء" : "إرسال كود OTP"}
                  </button>
                </div>

                {isOtpSectionOpen && (
                  <div className="space-y-2.5 pt-1 animate-in fade-in">
                    <p className="text-[11px] text-muted-foreground">
                      يُرسل كود التحقق بعد قيام العميل بتسجيل الدخول وإرفاق إثبات الشاشة.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="أدخل كود التحقق (مثال: 489210)"
                        className="flex-1 px-3 py-2 text-xs font-mono font-bold tracking-widest bg-background border border-border rounded-xl text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={!otpCode.trim() || !selectedItemId}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>إرسال كود OTP</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE 2: CODE / ACTIVATION CARD MODE                                      */}
          {/* ========================================================================= */}
          {mode === "card" && (
            <div className="space-y-4">
              {/* Product / Card Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  اسم البطاقة أو كود التفعيل
                </label>
                <input
                  type="text"
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  placeholder="مثال: Nintendo eShop $50 US أو كود تفعيل Xbox Game Pass"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Code Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  كود التفعيل / رقم البطاقة
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardCode}
                    onChange={(e) => setCardCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2.5 text-sm font-mono font-bold tracking-wider bg-background border border-border rounded-xl text-foreground focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Toggle PIN field */}
              <div className="space-y-2">
                {!showPinField ? (
                  <button
                    type="button"
                    onClick={() => setShowPinField(true)}
                    className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة الرقم السري (PIN) إذا كانت البطاقة تتطلب ذلك</span>
                  </button>
                ) : (
                  <div className="space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground">الرقم السري (PIN)</label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPinField(false);
                          setCardPin("");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-red-500 font-bold"
                      >
                        إلغاء PIN
                      </button>
                    </div>
                    <input
                      type="text"
                      value={cardPin}
                      onChange={(e) => setCardPin(e.target.value)}
                      placeholder="e.g. 1234"
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      dir="ltr"
                    />
                  </div>
                )}
              </div>

              {/* Live Preview for Card */}
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-bold text-muted-foreground block">
                  معاينة بطاقة الكود (كما ستظهر للعميل):
                </span>
                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 max-w-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold text-foreground">
                        كود البطاقة / التفعيل
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                      جاهز للاستخدام
                    </span>
                  </div>

                  <div className="text-xs font-bold text-foreground truncate">{cardTitle}</div>

                  <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between">
                    <span
                      className="font-mono font-bold text-sm tracking-wider text-foreground select-all truncate"
                      dir="ltr"
                    >
                      {cardCode || "XXXX-XXXX-XXXX-XXXX"}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(cardCode, "كود البطاقة")}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {cardPin && (
                    <div className="p-2 rounded-xl bg-card border border-border flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">PIN:</span>
                      <span className="font-mono font-bold text-foreground" dir="ltr">
                        {cardPin}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
            >
              إلغاء
            </button>

            {order && order.status !== "completed" && onCompleteOrder && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onCompleteOrder(order.id);
                    toast.success("تم إكمال الطلب وإرسال بطاقة التقييم بنجاح ✅");
                    onClose();
                  } catch (err: any) {
                    toast.error(err?.message || "فشل إكمال الطلب");
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="تأكيد اكتمال جميع عناصر الطلب وإغلاق التجهيز"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>✓ تأكيد اكتمال الطلب</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === "account" ? (
              <button
                type="button"
                onClick={handleSendCurrentAccount}
                // No game picked means nothing downstream can attribute this
                // delivery to an order item, so the button stays shut.
                disabled={!username.trim() || !password.trim() || !selectedItemId}
                className="px-5 py-2.5 bg-foreground hover:bg-foreground/90 disabled:opacity-40 text-background rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {stagedAccounts.length > 1
                    ? `إرسال الحساب (${selectedAccountIndex + 1}/${stagedAccounts.length})`
                    : "إرسال بيانات الحساب للعميل"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendCard}
                disabled={!cardCode.trim()}
                className="px-5 py-2.5 bg-foreground hover:bg-foreground/90 disabled:opacity-40 text-background rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال كود التفعيل للعميل</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
