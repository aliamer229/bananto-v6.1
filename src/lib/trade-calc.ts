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

/**
 * The trade lifecycle.
 *
 * Nine states, and every one of them answers a different question. The previous
 * set had ten, of which `approved`, `payout_pending` and `payout_processing`
 * were three names for "we agreed, money is happening", and `waiting_review`
 * covered both "nobody has priced this" and "priced, nobody has looked". Admins
 * were picking a status from a long dropdown of near-synonyms, which is why the
 * same stage got recorded three different ways.
 *
 * The seven ordinary states run in a straight line. `rejected` and `cancelled`
 * are the only exits from it.
 */
export const TRADE_STATUSES = [
  /** No price yet. Manual-priced requests start here. */
  "awaiting_pricing",
  /** A price exists — automatic or entered by an admin — but is not yet offered. */
  "priced",
  /** The offer is with the customer. */
  "awaiting_customer_approval",
  /** The customer took the offer. */
  "customer_approved",
  /** We are waiting for the disc to arrive. */
  "awaiting_receipt",
  /** It arrived and is being checked. */
  "inspecting",
  /** Done. */
  "completed",
  /** Exceptions. */
  "rejected",
  "cancelled",
] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

/** The seven states that make up the normal path, in order. */
export const TRADE_MAIN_FLOW: TradeStatus[] = [
  "awaiting_pricing",
  "priced",
  "awaiting_customer_approval",
  "customer_approved",
  "awaiting_receipt",
  "inspecting",
  "completed",
];

/**
 * How a request is priced.
 *
 * `auto` — the site computes an estimate from the product's base price and the
 * condition answers. The admin reviews it, may change it, then approves.
 * `manual` — the site computes nothing final; an admin types the number.
 *
 * Every request is one or the other, and the badge on the card says which.
 */
export const TRADE_PRICING_MODES = ["auto", "manual"] as const;
export type TradePricingMode = (typeof TRADE_PRICING_MODES)[number];

export const TRADE_PRICING_MODE_LABEL_AR: Record<TradePricingMode, string> = {
  auto: "تسعير تلقائي",
  manual: "تسعير يدوي",
};

export const TRADE_PRICING_MODE_BADGE_STYLE: Record<TradePricingMode, string> = {
  auto: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  manual: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

export function normalizeTradePricingMode(value: unknown): TradePricingMode {
  return String(value ?? "").toLowerCase() === "manual" ? "manual" : "auto";
}

/**
 * Where a request starts, which is decided entirely by its pricing mode.
 *
 * Auto: an estimate already exists at submission, so it opens at `priced` and
 * the admin's first job is to review it.
 * Manual: nothing has been priced, so it opens at `awaiting_pricing`.
 */
export function initialTradeStatus(mode: TradePricingMode): TradeStatus {
  return mode === "manual" ? "awaiting_pricing" : "priced";
}

/**
 * Every status this app has ever written, mapped onto the current set.
 *
 * Existing rows keep rendering and keep moving; nothing needs a data migration
 * to be readable.
 */
export const LEGACY_STATUS_MAP: Record<string, TradeStatus> = {
  // current
  awaiting_pricing: "awaiting_pricing",
  priced: "priced",
  awaiting_customer_approval: "awaiting_customer_approval",
  customer_approved: "customer_approved",
  awaiting_receipt: "awaiting_receipt",
  inspecting: "inspecting",
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",

  // previous generation
  pending: "awaiting_pricing",
  submitted: "awaiting_pricing",
  waiting_review: "awaiting_pricing",
  offer_sent: "awaiting_customer_approval",
  user_approved: "customer_approved",
  waiting_shipment: "awaiting_receipt",
  received: "inspecting",
  approved: "customer_approved",
  // The three payout synonyms all meant "agreed, settling up".
  payout_pending: "inspecting",
  payout_processing: "inspecting",
  payout_completed: "completed",
  coupon_issued: "completed",
  cash_paid: "completed",
  cancelled_by_user: "cancelled",
  auto_cancelled: "cancelled",
};

export function normalizeTradeStatus(status: string | null | undefined): TradeStatus {
  if (!status) return "awaiting_pricing";
  const mapped = LEGACY_STATUS_MAP[status.toLowerCase()];
  if (mapped) return mapped;
  return TRADE_STATUSES.includes(status as TradeStatus)
    ? (status as TradeStatus)
    : "awaiting_pricing";
}

/**
 * Allowed moves.
 *
 * The forward path is one step at a time — a status is a record of what has
 * happened, and skipping states makes the history a lie. `rejected` and
 * `cancelled` are reachable from anywhere that has not finished.
 */
export const TRADE_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  awaiting_pricing: ["priced", "rejected", "cancelled"],
  priced: ["awaiting_customer_approval", "awaiting_pricing", "rejected", "cancelled"],
  awaiting_customer_approval: ["customer_approved", "priced", "rejected", "cancelled"],
  customer_approved: ["awaiting_receipt", "rejected", "cancelled"],
  awaiting_receipt: ["inspecting", "rejected", "cancelled"],
  inspecting: ["completed", "rejected", "cancelled"],
  completed: [],
  // Reopening puts a request back at the start of the line rather than
  // somewhere in the middle, so it is re-priced before anything else happens.
  rejected: ["awaiting_pricing"],
  cancelled: ["awaiting_pricing"],
};

export function canTransition(from: string, to: string, isAdmin = false): boolean {
  const normFrom = normalizeTradeStatus(from);
  const normTo = normalizeTradeStatus(to);
  if (normFrom === normTo) return true;
  if (normFrom === "completed") return false;

  // An admin may abandon a request at any point before it is finished.
  if (isAdmin && (normTo === "rejected" || normTo === "cancelled")) return true;

  const allowed = TRADE_TRANSITIONS[normFrom];
  return Array.isArray(allowed) && allowed.includes(normTo);
}

export const TRADE_STATUS_LABEL_AR: Record<TradeStatus, string> = {
  awaiting_pricing: "بانتظار التسعير",
  priced: "تم التسعير",
  awaiting_customer_approval: "بانتظار موافقة العميل",
  customer_approved: "تمت الموافقة",
  awaiting_receipt: "بانتظار الاستلام",
  inspecting: "قيد الفحص",
  completed: "مكتملة",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
};

/**
 * The one thing the admin should do next, per status.
 *
 * The card carries a single primary button rather than a status dropdown: the
 * status is a consequence of the action, so it cannot be set to something the
 * work has not reached. `null` means the ball is not in the admin's court.
 */
export interface TradeAdminAction {
  label: string;
  /** Status the request moves to when the action is taken. */
  next: TradeStatus;
}

export const TRADE_PRIMARY_ACTION: Record<TradeStatus, TradeAdminAction | null> = {
  awaiting_pricing: { label: "تسعير ومراجعة", next: "priced" },
  priced: { label: "اعتماد السعر", next: "awaiting_customer_approval" },
  // Waiting on the customer; the admin has nothing to do but wait.
  awaiting_customer_approval: null,
  customer_approved: { label: "بدء الاستلام", next: "awaiting_receipt" },
  awaiting_receipt: { label: "تأكيد الاستلام", next: "inspecting" },
  inspecting: { label: "إكمال المقايضة", next: "completed" },
  completed: null,
  rejected: null,
  cancelled: null,
};

export function tradePrimaryAction(status: string | null | undefined): TradeAdminAction | null {
  return TRADE_PRIMARY_ACTION[normalizeTradeStatus(status)];
}

export const TRADE_STATUS_BADGE_STYLE: Record<TradeStatus, string> = {
  awaiting_pricing: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  priced: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  awaiting_customer_approval:
    "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  customer_approved: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  awaiting_receipt: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  inspecting: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  completed: "bg-emerald-600 text-white border-emerald-700",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};
