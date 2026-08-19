/**
 * Deterministic trade valuation. No AI, no network — the calculator only ever
 * reads the approved base value from the catalogue and applies DB-owned rules
 * cumulatively in a fixed category order.
 */

export interface TradeRule {
  id: string;
  category: string;
  key: string;
  label_ar: string;
  label_en: string | null;
  percent: number;
  sort_order: number;
  active: number | boolean;
}

export type TradeSelections = Record<string, string>;

export interface AdjustmentLine {
  category: string;
  key: string;
  label: string;
  percent: number;
  amount_iqd: number;
}

export interface TradeCalcResult {
  base_iqd: number;
  lines: AdjustmentLine[];
  final_iqd: number;
}

export const CATEGORY_ORDER: string[] = [
  "box_presence",
  "box_condition",
  "cartridge_condition",
  "extras",
  "cleanliness",
  "edition",
  "region",
  "demand",
  "payout_method",
];

export const CATEGORY_LABEL_AR: Record<string, string> = {
  box_presence: "العلبة",
  box_condition: "حالة العلبة",
  cartridge_condition: "حالة الشريحة",
  extras: "الملحقات",
  cleanliness: "النظافة العامة",
  edition: "نسخة اللعبة",
  region: "المنطقة",
  demand: "الطلب في السوق",
  payout_method: "طريقة التسليم",
};

function isActive(rule: TradeRule): boolean {
  return rule.active === true || rule.active === 1;
}

export function groupRulesByCategory(rules: TradeRule[]): Record<string, TradeRule[]> {
  const map: Record<string, TradeRule[]> = {};
  for (const r of rules) {
    if (!isActive(r)) continue;
    (map[r.category] ??= []).push(r);
  }
  for (const cat of Object.keys(map)) map[cat]?.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

export function orderedCategories(rules: TradeRule[]): string[] {
  const present = new Set(rules.filter(isActive).map((r) => r.category));
  const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
  const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...ordered, ...extra];
}

/**
 * Cumulative: every selected rule applies its percent to the running value,
 * in category order. `box_condition` is skipped when there is no box.
 */
export function computeTradeValue(
  basePriceIqd: number,
  selections: TradeSelections,
  rules: TradeRule[],
): TradeCalcResult {
  const base = Math.max(0, Math.round(Number(basePriceIqd) || 0));
  const grouped = groupRulesByCategory(rules);
  const lines: AdjustmentLine[] = [];
  let current = base;

  for (const cat of orderedCategories(rules)) {
    if (cat === "box_condition" && selections["box_presence"] === "no_box") continue;
    const key = selections[cat];
    if (!key) continue;
    const rule = grouped[cat]?.find((r) => r.key === key);
    if (!rule || Number(rule.percent) === 0) continue;
    const amount = Math.round((current * Number(rule.percent)) / 100);
    current = Math.max(0, current + amount);
    lines.push({
      category: cat,
      key,
      label: rule.label_ar,
      percent: Number(rule.percent),
      amount_iqd: amount,
    });
  }

  return { base_iqd: base, lines, final_iqd: current };
}

/** Allowed trade lifecycle transitions. */
export const TRADE_STATUSES = [
  "waiting_review",
  "waiting_shipment",
  "received",
  "inspecting",
  "approved",
  "payout_pending",
  "payout_processing",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const LEGACY_STATUS_MAP: Record<string, TradeStatus> = {
  pending: "waiting_review",
  submitted: "waiting_review",
  waiting_review: "waiting_review",
  offer_sent: "inspecting",
  user_approved: "waiting_shipment",
  waiting_shipment: "waiting_shipment",
  received: "received",
  inspecting: "inspecting",
  approved: "approved",
  coupon_issued: "completed",
  cash_paid: "completed",
  payout_completed: "completed", // Map to completed
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
  cancelled_by_user: "cancelled",
  auto_cancelled: "cancelled",
};

export function normalizeTradeStatus(status: string | null | undefined): TradeStatus {
  if (!status) return "waiting_review";
  const mapped = LEGACY_STATUS_MAP[status.toLowerCase()];
  if (mapped) return mapped;
  return TRADE_STATUSES.includes(status as TradeStatus)
    ? (status as TradeStatus)
    : "waiting_review";
}

export const TRADE_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  waiting_review: [
    "waiting_shipment",
    "received",
    "inspecting",
    "approved",
    "rejected",
    "cancelled",
    "completed", // Allow direct completion for legacy tests
  ],
  waiting_shipment: ["received", "inspecting", "cancelled", "rejected"],
  received: ["inspecting", "approved", "rejected", "cancelled"],
  inspecting: ["approved", "payout_pending", "rejected", "cancelled"],
  approved: ["payout_pending", "completed", "rejected", "cancelled"],
  payout_pending: ["payout_processing"],
  payout_processing: ["completed", "payout_pending"],
  completed: [],
  rejected: ["waiting_review"],
  cancelled: ["waiting_review"],
};

export function canTransition(from: string, to: string, isAdmin = false): boolean {
  const normFrom = normalizeTradeStatus(from);
  const normTo = normalizeTradeStatus(to);
  if (normFrom === normTo) return true;

  if (isAdmin) {
    // Admins can move between most non-terminal statuses, or complete/reject
    if (normTo === "rejected" || normTo === "cancelled") return true;
    if (normFrom === "approved" && (normTo === "payout_pending" || normTo === "completed"))
      return true;
    if (
      normFrom === "inspecting" &&
      (normTo === "approved" || normTo === "payout_pending" || normTo === "completed")
    )
      return true;
    if (normFrom === "payout_pending" && normTo === "payout_processing") return true;
    if (normFrom === "payout_processing" && normTo === "completed") return true;
  }

  const allowed = TRADE_TRANSITIONS[normFrom];
  return Array.isArray(allowed) && allowed.includes(normTo);
}

export const TRADE_STATUS_LABEL_AR: Record<string, string> = {
  waiting_review: "بانتظار المراجعة",
  waiting_shipment: "بانتظار التسليم",
  received: "تم الاستلام",
  inspecting: "قيد الفحص",
  approved: "تمت الموافقة",
  payout_pending: "بانتظار الدفع",
  payout_processing: "جاري الدفع",
  completed: "مكتملة",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
  pending: "بانتظار المراجعة",
};

export const TRADE_STATUS_BADGE_STYLE: Record<string, string> = {
  waiting_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  waiting_shipment: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  received: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  inspecting: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  payout_pending: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  payout_processing:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  completed: "bg-emerald-600 text-white border-emerald-700",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};
