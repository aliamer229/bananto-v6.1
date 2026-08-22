import React, { useState, useEffect, useMemo } from "react";
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
}

export function AccountToolsModal({
  isOpen,
  onClose,
  order,
  defaultTab = "credentials",
  onSendCredentials,
  onSendVerificationCode,
  onSendCardCode,
}: AccountToolsModalProps) {
  // 1. Analyze order items to determine mode & slots
  const orderItems: OrderItem[] = useMemo(() => order?.items || [], [order]);

  const hasCodeItems = useMemo(
    () => orderItems.some((i) => i.kind === "code" || i.kind === "gift_card"),
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
      title: item.title,
      quantity: item.quantity || 1,
      kind: item.kind,
    }));
  }, [orderItems]);

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
          title: item.title,
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
      setSelectedGameTitle(firstItem.title);
      setSelectedItemId(firstItem.id);
      setSelectedSlotNumber(1);
      setCardTitle(firstItem.title);
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
      if (acc.matchedItemTitle) {
        setSelectedGameTitle(acc.matchedItemTitle);
      }
      if (acc.matchedItemId) {
        setSelectedItemId(acc.matchedItemId);
      }
      if (acc.slotNumber) {
        setSelectedSlotNumber(acc.slotNumber);
      }
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

    const newStaged: StagedAccountState[] = matched.map((m, idx) => {
      const targetSlot = deliverableSlots[idx];
      return {
        id: `staged-${Date.now()}-${idx}`,
        username: m.account.username,
        password: m.account.password,
        label: m.account.label,
        matchedItemId:
          m.matchedItemId ||
          targetSlot?.itemId ||
          (orderItems[0]?.id ? orderItems[0].id : undefined),
        matchedItemTitle:
          m.matchedItemTitle ||
          targetSlot?.title ||
          (orderItems[0]?.title ? orderItems[0].title : undefined),
        slotNumber: m.slotNumber || targetSlot?.slotIndex || 1,
        isSent: false,
      };
    });

    setStagedAccounts(newStaged);
    setSelectedAccountIndex(0);

    if (newStaged[0]) {
      setUsername(newStaged[0].username);
      setPassword(newStaged[0].password);
      if (newStaged[0].matchedItemTitle) {
        setSelectedGameTitle(newStaged[0].matchedItemTitle);
      }
      if (newStaged[0].matchedItemId) {
        setSelectedItemId(newStaged[0].matchedItemId);
      }
      if (newStaged[0].slotNumber) {
        setSelectedSlotNumber(newStaged[0].slotNumber);
      }
    }

    const matchedCount = newStaged.filter((s) => s.matchedItemId).length;
    toast.success(
      `تم استخراج ${newStaged.length} حساب${
        orderItems.length > 0 ? ` ومطابقة ${matchedCount} مع الطلب` : ""
      }`,
    );
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
    setSelectedGameTitle(item.title);
    setSelectedItemId(item.id);
    setSelectedSlotNumber(slotNumber);

    if (stagedAccounts[selectedAccountIndex]) {
      const copy = [...stagedAccounts];
      copy[selectedAccountIndex] = {
        ...copy[selectedAccountIndex]!,
        matchedItemId: item.id,
        matchedItemTitle: item.title,
        slotNumber,
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

    onSendCredentials({
      title: selectedGameTitle.trim() || undefined,
      email: username.trim(),
      password: password.trim(),
      itemId: selectedItemId || undefined,
      slot: selectedSlotNumber,
    });

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

    let sentCount = 0;
    stagedAccounts.forEach((acc, idx) => {
      if (!acc.username || !acc.password || acc.isSent) return;
      onSendCredentials({
        title: acc.matchedItemTitle || selectedGameTitle || undefined,
        email: acc.username,
        password: acc.password,
        itemId: acc.matchedItemId || undefined,
        slot: acc.slotNumber || idx + 1,
      });
      sentCount++;
    });

    toast.success(`تم إرسال ${sentCount} حساب للعميل`);
    onClose();
  };

  // Send OTP
  const handleSendOtp = () => {
    if (!otpCode.trim()) {
      toast.error("يرجى إدخال كود التحقق OTP");
      return;
    }

    onSendVerificationCode({
      code: otpCode.trim(),
      expiresInMinutes: 15,
      itemId: selectedItemId || undefined,
      title: selectedGameTitle || undefined,
    });

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
                    <span className="text-[10px] opacity-75">{deliverableSlots.length} عنصر</span>
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
                          {acc.matchedItemTitle && (
                            <span className="text-[10px] opacity-80 truncate max-w-[100px]">
                              ({acc.matchedItemTitle})
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
                {/* 3. Game Title */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">
                    اسم اللعبة أو المنتج
                  </label>
                  <input
                    type="text"
                    value={selectedGameTitle}
                    onChange={(e) => {
                      setSelectedGameTitle(e.target.value);
                      if (stagedAccounts[selectedAccountIndex]) {
                        const copy = [...stagedAccounts];
                        copy[selectedAccountIndex] = {
                          ...copy[selectedAccountIndex]!,
                          matchedItemTitle: e.target.value,
                        };
                        setStagedAccounts(copy);
                      }
                    }}
                    placeholder="مثال: Nintendo Switch Sports أو EA SPORTS FC 26"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />
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
                        disabled={!otpCode.trim()}
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
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            {mode === "account" ? (
              <button
                type="button"
                onClick={handleSendCurrentAccount}
                disabled={!username.trim() || !password.trim()}
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
