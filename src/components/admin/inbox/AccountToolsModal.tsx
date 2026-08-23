import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DELIVERY_OTP_TTL_MINUTES } from "@/lib/delivery-otp";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Gamepad2,
  Key,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket,
  X,
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

import type { Order } from "@/lib/types";
import type { DeliveryItemStatus } from "@/lib/digital-delivery-state";

interface DeliveryItemView {
  id: string;
  orderId: string;
  orderItemId: string | null;
  productId: string | null;
  productTitle: string | null;
  slotNumber: number | null;
  kind: string;
  status: DeliveryItemStatus;
  username: string;
  password: string;
  detectedGame: string | null;
  matchConfidence: number | null;
  sentAt: string | null;
  proofReceivedAt: string | null;
  proofUrl: string | null;
  otpSentAt: string | null;
  completedAt: string | null;
  revision: number;
  archivedAt: string | null;
  updatedAt: string;
}

interface DeliveryStateView {
  orderId: string;
  orderCode: string;
  orderStatus: Order["status"];
  lastOtpSentAt: string | null;
  autoCompleteAt: string | null;
  deliveryIssueOpenedAt: string | null;
  orderItems: Array<{
    id: string;
    productId: string;
    productTitle: string;
    kind: string;
    quantity: number;
  }>;
  deliveryItems: DeliveryItemView[];
  progress: {
    total: number;
    prepared: number;
    delivered: number;
    needsMapping: number;
    drafts: number;
  };
}

interface DeliveryActionResponse {
  success?: boolean;
  state?: DeliveryStateView;
  orderFinished?: boolean;
  nextReadyDeliveryItemId?: string;
  nextOrder?: {
    orderId: string;
    threadId?: string;
    code?: string;
    userName?: string;
  };
  extracted?: number;
  mapped?: number;
  needsMapping?: number;
  skipped?: Array<{ line: number; raw: string }>;
  duplicates?: string[];
  error?: string;
  code?: string;
}

export interface AccountToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  defaultTab?: "credentials" | "card" | "otp" | "instructions";
  onDeliveryFinished?: (payload: {
    nextOrder?: DeliveryActionResponse["nextOrder"];
  }) => void;
  onStateChanged?: () => void;
}

interface DraftFields {
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
  dirty: boolean;
}

const STATUS_LABEL: Record<DeliveryItemStatus, string> = {
  draft: "مسودة",
  needs_mapping: "بحاجة إلى ربط",
  ready: "جاهز",
  sent: "أُرسل الحساب",
  proof_received: "وصل الإثبات",
  otp_sent: "أُرسل OTP",
  completed: "مكتمل",
};

const LOCKED_STATUSES = new Set<DeliveryItemStatus>([
  "sent",
  "proof_received",
  "otp_sent",
  "completed",
]);

function isCodeKind(kind: string) {
  return ["digital_code", "code", "gift_card"].includes(kind);
}

async function readJsonResponse(
  response: Response,
): Promise<DeliveryActionResponse> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as DeliveryActionResponse;
  if (!response.ok) {
    throw new Error(
      payload.error || payload.code || "تعذر حفظ بيانات التسليم في D1",
    );
  }
  return payload;
}

export function AccountToolsModal({
  isOpen,
  onClose,
  order,
  defaultTab = "credentials",
  onDeliveryFinished,
  onStateChanged,
}: AccountToolsModalProps) {
  const [deliveryState, setDeliveryState] = useState<DeliveryStateView | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [otpById, setOtpById] = useState<Record<string, string>>({});
  const [quickPaste, setQuickPaste] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isQuickPasting, setIsQuickPasting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const lastQuickPasteRef = useRef("");
  const deliveryStateRef = useRef<DeliveryStateView | null>(null);
  const draftsRef = useRef<Record<string, DraftFields>>({});
  // All autosaves share one ordered chain. This prevents an older request from
  // arriving later and overwriting a newer field or another item's response.
  const saveChainRef = useRef<Promise<DeliveryStateView | null>>(
    Promise.resolve(null),
  );

  const applyState = useCallback(
    (next: DeliveryStateView, preserveDirty = false) => {
      deliveryStateRef.current = next;
      setDeliveryState(next);
      const result: Record<string, DraftFields> = {};
      for (const item of next.deliveryItems) {
        const pending = draftsRef.current[item.id];
        result[item.id] =
          preserveDirty && pending?.dirty
            ? pending
            : {
                username: item.username,
                password: item.password,
                dirty: false,
              };
      }
      draftsRef.current = result;
      setDrafts(result);
      setSelectedId((current) => {
        if (current && next.deliveryItems.some((item) => item.id === current))
          return current;
        const preferred =
          defaultTab === "otp"
            ? next.deliveryItems.find(
                (item) => item.status === "proof_received",
              )
            : next.deliveryItems.find(
                (item) =>
                  item.orderItemId &&
                  !["otp_sent", "completed"].includes(item.status),
              );
        return preferred?.id || next.deliveryItems[0]?.id || "";
      });
    },
    [defaultTab],
  );

  const loadState = useCallback(async () => {
    if (!order?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/orders?delivery=1&orderId=${encodeURIComponent(order.id)}`,
        { credentials: "include" },
      );
      const payload = await readJsonResponse(response);
      if (!payload.state) throw new Error("لم تُرجع الخدمة حالة تجهيز صالحة");
      applyState(payload.state);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل بيانات التجهيز",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyState, order?.id]);

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
  useEffect(() => {
    if (isOpen) void loadState();
  }, [isOpen, loadState]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  const postAction = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!order?.id) throw new Error("الطلب غير مرتبط بالمحادثة");
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          threadId: order.threadId,
          ...payload,
        }),
      });
      return readJsonResponse(response);
    },
    [order?.id, order?.threadId],
  );

  const saveOneDraft = useCallback(
    (
      deliveryItemId: string,
      fields?: DraftFields,
    ): Promise<DeliveryStateView | null> => {
      const snapshot = fields || draftsRef.current[deliveryItemId];
      if (!snapshot?.dirty) {
        return saveChainRef.current.then(() => deliveryStateRef.current);
      }

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
      const task = saveChainRef.current
        .catch(() => null)
        .then(async () => {
          setSavingIds((value) => ({ ...value, [deliveryItemId]: true }));
          try {
            const result = await postAction({
              action: "save_delivery_draft",
              deliveryItemId,
              email: snapshot.username,
              password: snapshot.password,
            });
            if (result.state) applyState(result.state, true);
            setDrafts((value) => {
              const latest = value[deliveryItemId];
              if (
                !latest ||
                latest.username !== snapshot.username ||
                latest.password !== snapshot.password
              ) {
                return value;
              }
              const next = {
                ...value,
                [deliveryItemId]: { ...latest, dirty: false },
              };
              draftsRef.current = next;
              return next;
            });
            onStateChanged?.();
            return result.state || deliveryStateRef.current;
          } finally {
            setSavingIds((value) => ({ ...value, [deliveryItemId]: false }));
          }
        });
      saveChainRef.current = task.catch(() => deliveryStateRef.current);
      return task;
    },
    [applyState, onStateChanged, postAction],
  );

  const scheduleDraftSave = useCallback(
    (deliveryItemId: string, next: Omit<DraftFields, "dirty">) => {
      const fields: DraftFields = { ...next, dirty: true };
      const nextDrafts = { ...draftsRef.current, [deliveryItemId]: fields };
      draftsRef.current = nextDrafts;
      setDrafts(nextDrafts);
      const previousTimer = timersRef.current.get(deliveryItemId);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(() => {
        timersRef.current.delete(deliveryItemId);
        void saveOneDraft(deliveryItemId, fields).catch((saveError) => {
          toast.error(
            saveError instanceof Error
              ? saveError.message
              : "فشل الحفظ التلقائي",
          );
        });
      }, 450);
      timersRef.current.set(deliveryItemId, timer);
    },
    [saveOneDraft],
  );

  const flushDraft = useCallback(
    async (deliveryItemId: string) => {
      const timer = timersRef.current.get(deliveryItemId);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(deliveryItemId);
      }
      return saveOneDraft(deliveryItemId, draftsRef.current[deliveryItemId]);
    },
    [saveOneDraft],
  );

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
  const handleClose = async () => {
    const dirtyIds = Object.entries(draftsRef.current)
      .filter(([, fields]) => fields.dirty)
      .map(([id]) => id);
    try {
      await Promise.all(dirtyIds.map((id) => flushDraft(id)));
      onClose();
    } catch (closeError) {
      toast.error(
        closeError instanceof Error
          ? closeError.message
          : "لم يكتمل حفظ المسودات",
      );
    }
  };

  const selected = useMemo(
    () =>
      deliveryState?.deliveryItems.find((item) => item.id === selectedId) ||
      null,
    [deliveryState?.deliveryItems, selectedId],
  );
  const selectedDraft = selected ? drafts[selected.id] : undefined;
  const mappedItems = useMemo(
    () =>
      deliveryState?.deliveryItems.filter((item) =>
        Boolean(item.orderItemId),
      ) || [],
    [deliveryState?.deliveryItems],
  );
  const unmappedItems = useMemo(
    () =>
      deliveryState?.deliveryItems.filter(
        (item) => item.status === "needs_mapping",
      ) || [],
    [deliveryState?.deliveryItems],
  );

  const handleQuickPaste = useCallback(async () => {
    const rawText = quickPaste.trim();
    if (!rawText || isQuickPasting || rawText === lastQuickPasteRef.current)
      return;
    setIsQuickPasting(true);
    try {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      const dirtyDrafts = Object.entries(draftsRef.current).filter(
        ([, fields]) => fields.dirty,
      );
      await Promise.all(
        dirtyDrafts.map(([id, fields]) => saveOneDraft(id, fields)),
      );
      const result = await postAction({
        action: "delivery_quick_paste",
        rawText,
      });
      lastQuickPasteRef.current = rawText;
      if (result.state) applyState(result.state);
      setQuickPaste("");
      toast.success(
        `تم حفظ ${result.extracted || 0} حساب في D1: ${result.mapped || 0} مطابق، ${
          result.needsMapping || 0
        } يحتاج ربطًا`,
      );
      if (result.skipped?.length)
        toast.warning(`تعذر استخراج ${result.skipped.length} سطر`);
      onStateChanged?.();
    } catch (pasteError) {
      toast.error(
        pasteError instanceof Error ? pasteError.message : "فشل اللصق السريع",
      );
    } finally {
      setIsQuickPasting(false);
    }
  }, [
    applyState,
    isQuickPasting,
    onStateChanged,
    postAction,
    quickPaste,
    saveOneDraft,
  ]);

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
  useEffect(() => {
    if (!isOpen || !quickPaste.trim() || isQuickPasting) return;
    if (!/(?:密码|密碼|password|pass|pwd)/i.test(quickPaste)) return;
    const timer = setTimeout(() => void handleQuickPaste(), 700);
    return () => clearTimeout(timer);
  }, [handleQuickPaste, isOpen, isQuickPasting, quickPaste]);

  const mapItem = async (
    sourceDeliveryItemId: string,
    targetDeliveryItemId: string,
  ) => {
    setBusyId(sourceDeliveryItemId);
    try {
      const result = await postAction({
        action: "map_delivery_item",
        sourceDeliveryItemId,
        targetDeliveryItemId,
      });
      if (result.state) applyState(result.state);
      setSelectedId(targetDeliveryItemId);
      toast.success("تم ربط الحساب باللعبة المحددة وحفظه");
      onStateChanged?.();
    } catch (mapError) {
      toast.error(
        mapError instanceof Error ? mapError.message : "تعذر ربط الحساب",
      );
    } finally {
      setBusyId(null);
    }
  };

  const sendCredentials = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    try {
      await flushDraft(selected.id);
      const result = await postAction({
        action: "send_delivery_credentials",
        deliveryItemId: selected.id,
      });
      if (result.state) applyState(result.state);
      if (result.nextReadyDeliveryItemId) {
        setSelectedId(result.nextReadyDeliveryItemId);
        toast.success("تم إرسال هذا الحساب والانتقال إلى الحساب الجاهز التالي");
      } else {
        toast.success(
          "تم إرسال بيانات هذا الحساب. لا يوجد حساب آخر جاهز للإرسال الآن.",
        );
      }
      onStateChanged?.();
    } catch (sendError) {
      toast.error(
        sendError instanceof Error ? sendError.message : "فشل إرسال الحساب",
      );
    } finally {
      setBusyId(null);
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
  const sendOtp = async () => {
    if (!selected) return;
    const code = (otpById[selected.id] || "").trim();
    if (!code) {
      toast.error("أدخل كود OTP");
      return;
    }
    setBusyId(selected.id);
    try {
      const result = await postAction({
        action: "send_delivery_otp",
        deliveryItemId: selected.id,
        code,
      });
      if (result.state) applyState(result.state);
      setOtpById((value) => ({ ...value, [selected.id]: "" }));
      onStateChanged?.();
      if (result.orderFinished) {
        toast.success("تم إرسال آخر OTP وإخراج الطلب من طابور التجهيز");
        onDeliveryFinished?.({ nextOrder: result.nextOrder });
        onClose();
      } else if (result.nextReadyDeliveryItemId) {
        setSelectedId(result.nextReadyDeliveryItemId);
        toast.success("تم إرسال OTP والانتقال إلى اللعبة الجاهزة التالية");
      } else {
        toast.success("تم إرسال OTP لهذا الحساب. الطلب ينتظر بقية العناصر.");
      }
    } catch (otpError) {
      toast.error(
        otpError instanceof Error ? otpError.message : "فشل إرسال OTP",
      );
    } finally {
      setBusyId(null);
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
  const sendCode = async () => {
    if (!selected || !selectedDraft?.username.trim()) return;
    setBusyId(selected.id);
    try {
      await flushDraft(selected.id);
      const result = await postAction({
        action: "send_delivery_code",
        deliveryItemId: selected.id,
        code: selectedDraft.username,
        pin: selectedDraft.password || undefined,
      });
      if (result.state) applyState(result.state);
      onStateChanged?.();
      if (result.orderFinished) {
        toast.success("تم إرسال آخر كود وإخراج الطلب من طابور التجهيز");
        onDeliveryFinished?.({ nextOrder: result.nextOrder });
        onClose();
      } else {
        toast.success("تم إرسال الكود لهذا العنصر");
      }
    } catch (codeError) {
      toast.error(
        codeError instanceof Error ? codeError.message : "فشل إرسال الكود",
      );
    } finally {
      setBusyId(null);
    }
  };

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  };

  const generatePassword = () => {
    if (!selected || !selectedDraft) return;
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let generated = "";
    for (let index = 0; index < 12; index += 1) {
      generated += alphabet[Math.floor(Math.random() * alphabet.length)];
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
    scheduleDraftSave(selected.id, {
      username: selectedDraft.username,
      password: generated,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      dir="rtl"
    >
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
              <Key className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  أداة تسليم الطلب
                </h3>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  #{deliveryState?.orderCode || order?.code || "—"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                المصدر: order → order_items → product_id → product.title
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> تحميل المسودات من
              D1...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              <button
                type="button"
                onClick={() => void loadState()}
                className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
              </button>
            </div>
          ) : deliveryState ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                  تم تجهيز {deliveryState.progress.prepared} من{" "}
                  {deliveryState.progress.total}
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  تم تسليم {deliveryState.progress.delivered} من{" "}
                  {deliveryState.progress.total}
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <ClipboardPaste className="h-4 w-4" /> اللصق السريع
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleQuickPaste()}
                    disabled={!quickPaste.trim() || isQuickPasting}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold disabled:opacity-50"
                  >
                    {isQuickPasting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}{" "}
                    استخراج وحفظ
                  </button>
                </div>
                <textarea
                  value={quickPaste}
                  onChange={(event) => {
                    setQuickPaste(event.target.value);
                    if (event.target.value.trim() !== lastQuickPasteRef.current)
                      lastQuickPasteRef.current = "";
                  }}
                  rows={3}
                  dir="ltr"
                  placeholder="ttxx7834 密码 a8dqq9sr 运动switch&#10;rrtt8896 密码 45g54pby 朋友收集 梦想生活"
                  className="w-full resize-y rounded-xl border border-border bg-background p-2.5 font-mono text-xs leading-relaxed text-foreground outline-hidden focus:ring-2 focus:ring-amber-500/30"
                />
                <p className="text-[10px] text-muted-foreground">
                  كل سطر يُحفظ كسجل مستقل. السطر غير الموثوق لا يُوزع على أي
                  لعبة.
                </p>
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
              {unmappedItems.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    {unmappedItems.length} حساب يحتاج ربطًا يدويًا
                  </div>
                  {unmappedItems.map((source) => {
                    const availableTargets = mappedItems.filter((target) => {
                      const draft = drafts[target.id];
                      return (
                        ["draft", "ready"].includes(target.status) &&
                        !(draft?.username || target.username)
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
                    });
                    return (
                      <div
                        key={source.id}
                        className="rounded-xl border border-border bg-card p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-bold" dir="ltr">
                            {source.username}
                          </span>
                          <span className="text-red-600">
                            الكشف: {source.detectedGame || "لم يُتعرف على لعبة"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availableTargets.length ? (
                            availableTargets.map((target) => (
                              <button
                                type="button"
                                key={target.id}
                                disabled={busyId === source.id}
                                onClick={() =>
                                  void mapItem(source.id, target.id)
                                }
                                className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50"
                              >
                                {target.productTitle}{" "}
                                {target.slotNumber
                                  ? `#${target.slotNumber}`
                                  : ""}
                              </button>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              لا توجد خانة لعبة فارغة؛ راجع عدد عناصر الطلب.
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              بحاجة لتحديد اللعبة
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Gamepad2 className="h-4 w-4 text-primary" /> الألعاب وعناصر
                    التسليم
                  </span>
                  <span>{mappedItems.length} خانة مستقلة</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {mappedItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`min-w-[145px] rounded-xl border px-3 py-2 text-right transition-colors ${selectedId === item.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}
                    >
                      <span className="block truncate text-[11px] font-bold text-foreground">
                        {item.productTitle}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        #{item.slotNumber || 1} • {STATUS_LABEL[item.status]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selected && selected.orderItemId && selectedDraft && (
                <div className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        اسم اللعبة من D1
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-foreground">
                        <Gamepad2 className="h-4 w-4 text-primary" />
                        {selected.productTitle}
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>

                  {isCodeKind(selected.kind) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-bold">
                        <span>كود التفعيل</span>
                        <input
                          dir="ltr"
                          value={selectedDraft.username}
                          disabled={LOCKED_STATUSES.has(selected.status)}
                          onChange={(event) =>
                            scheduleDraftSave(selected.id, {
                              username: event.target.value,
                              password: selectedDraft.password,
                            })
                          }
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs disabled:opacity-60"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-bold">
                        <span>PIN اختياري</span>
                        <input
                          dir="ltr"
                          value={selectedDraft.password}
                          disabled={LOCKED_STATUSES.has(selected.status)}
                          onChange={(event) =>
                            scheduleDraftSave(selected.id, {
                              username: selectedDraft.username,
                              password: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs disabled:opacity-60"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-bold">
                        <span>البريد الإلكتروني / اسم المستخدم</span>
                        <div className="relative">
                          <input
                            dir="ltr"
                            value={selectedDraft.username}
                            disabled={LOCKED_STATUSES.has(selected.status)}
                            onChange={(event) =>
                              scheduleDraftSave(selected.id, {
                                username: event.target.value,
                                password: selectedDraft.password,
                              })
                            }
                            onBlur={() => void flushDraft(selected.id)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 pl-8 font-mono text-xs disabled:opacity-60"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void copyValue(
                                selectedDraft.username,
                                `user-${selected.id}`,
                              )
                            }
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {copied === `user-${selected.id}` ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </label>
                      <label className="space-y-1.5 text-xs font-bold">
                        <span className="flex items-center justify-between">
                          كلمة المرور
                          {!LOCKED_STATUSES.has(selected.status) && (
                            <button
                              type="button"
                              onClick={generatePassword}
                              className="text-[10px] text-primary"
                            >
                              توليد
                            </button>
                          )}
                        </span>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            dir="ltr"
                            value={selectedDraft.password}
                            disabled={LOCKED_STATUSES.has(selected.status)}
                            onChange={(event) =>
                              scheduleDraftSave(selected.id, {
                                username: selectedDraft.username,
                                password: event.target.value,
                              })
                            }
                            onBlur={() => void flushDraft(selected.id)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 pl-9 font-mono text-xs disabled:opacity-60"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="flex min-h-5 items-center gap-1.5 text-[10px] text-muted-foreground">
                    {savingIds[selected.id] ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> جارٍ حفظ
                        مسودة هذه اللعبة في D1...
                      </>
                    ) : selectedDraft.dirty ? (
                      "بانتظار الحفظ التلقائي..."
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />{" "}
                        المسودة محفوظة على الخادم
                      </>
                    )}
                  </div>

                  {!isCodeKind(selected.kind) && (
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4" /> OTP لهذا الحساب
                        </span>
                        {selected.proofReceivedAt
                          ? "تم استلام الإثبات"
                          : "ينتظر إثبات العميل"}
                      </div>
                      <div className="flex gap-2">
                        <input
                          dir="ltr"
                          value={otpById[selected.id] || ""}
                          onChange={(event) =>
                            setOtpById((value) => ({
                              ...value,
                              [selected.id]: event.target.value,
                            }))
                          }
                          disabled={selected.status !== "proof_received"}
                          placeholder="أدخل OTP"
                          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs tracking-widest disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => void sendOtp()}
                          disabled={
                            selected.status !== "proof_received" ||
                            !(otpById[selected.id] || "").trim() ||
                            busyId === selected.id
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                        >
                          {busyId === selected.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}{" "}
                          إرسال OTP
                        </button>
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
              )}
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/20 p-4">
          <button
            type="button"
            onClick={() => void handleClose()}
            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            إغلاق
          </button>
          {selected && selectedDraft && isCodeKind(selected.kind) ? (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={
                !selectedDraft.username.trim() ||
                LOCKED_STATUSES.has(selected.status) ||
                busyId === selected.id
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-xs font-bold text-background disabled:opacity-40"
            >
              <Ticket className="h-3.5 w-3.5" /> إرسال كود هذا العنصر
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
          ) : selected ? (
            <button
              type="button"
              onClick={() => void sendCredentials()}
              disabled={
                selected.status !== "ready" ||
                busyId === selected.id ||
                Boolean(savingIds[selected.id])
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-xs font-bold text-background disabled:opacity-40"
            >
              {busyId === selected.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}{" "}
              إرسال الحساب المحدد
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default AccountToolsModal;
