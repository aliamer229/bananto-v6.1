/**
 * What a trade request's money says, in one place.
 *
 * A request carries up to three numbers and it matters enormously which one a
 * screen is showing:
 *
 * - **`base_iqd`** — the product's list value before condition adjustments.
 * - **`final_iqd`** — the *estimate*. Computed by the site from the condition
 *   answers on an auto-priced request; meaningless on a manual one.
 * - **`approved_iqd`** — what the business actually committed to. Written only
 *   when an admin approves the price, and nothing else may stand in for it.
 *
 * Cards used to show a single figure labelled "غير مسعر" whenever the estimate
 * was absent, which conflated three genuinely different situations: "this is
 * priced automatically and here is the estimate", "an admin has to price this
 * by hand and has not yet", and "priced and agreed". This module names all
 * three so no screen has to guess.
 */
import {
  normalizeTradePricingMode,
  normalizeTradeStatus,
  TRADE_PRICING_MODE_LABEL_AR,
  type TradePricingMode,
  type TradeStatus,
} from "./trade-calc";

export interface TradePricingRow {
  status?: string | null;
  pricing_mode?: string | null;
  base_iqd?: number | null;
  final_iqd?: number | null;
  approved_iqd?: number | null;
  /** Legacy column: an admin's number from before `approved_iqd` existed. */
  admin_valuation_iqd?: number | null;
  valuation_iqd?: number | null;
  store_offer_bonus_iqd?: number | null;
  store_offer_total_iqd?: number | null;
}

export interface TradePricingView {
  mode: TradePricingMode;
  modeLabel: string;
  status: TradeStatus;
  /** The estimate, when one exists. */
  estimateIqd: number | null;
  /** The committed price, when an admin has approved one. */
  approvedIqd: number | null;
  /** Label for the estimate line. Never just "غير مسعر". */
  estimateLabel: string;
  /** Label for the approved line. */
  approvedLabel: string;
  /** True when an admin still has to type a number before anything can proceed. */
  needsManualPricing: boolean;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function formatIqd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value)).toLocaleString("en-US")} د.ع`;
}

/**
 * Reads a row into the three-number view every trade surface renders from.
 */
export function readTradePricing(row: TradePricingRow): TradePricingView {
  const mode = normalizeTradePricingMode(row.pricing_mode);
  const status = normalizeTradeStatus(row.status);

  const estimateIqd = positive(row.final_iqd) ?? positive(row.store_offer_total_iqd);
  const approvedIqd =
    positive(row.approved_iqd) ??
    // Rows written before `approved_iqd` existed kept the admin's number here.
    positive(row.admin_valuation_iqd) ??
    positive(row.valuation_iqd);

  /*
    A manual request with no estimate is not "unpriced" in the sense of being
    broken — it is waiting for a person, and saying so is the difference between
    a customer thinking something went wrong and knowing what happens next.
  */
  const needsManualPricing = mode === "manual" && approvedIqd === null;

  let estimateLabel: string;
  if (estimateIqd !== null) {
    estimateLabel = formatIqd(estimateIqd);
  } else if (mode === "manual") {
    estimateLabel = "بانتظار التسعير اليدوي";
  } else {
    estimateLabel = "يتم احتساب السعر التقريبي";
  }

  const approvedLabel = approvedIqd !== null ? formatIqd(approvedIqd) : "—";

  return {
    mode,
    modeLabel: TRADE_PRICING_MODE_LABEL_AR[mode],
    status,
    estimateIqd,
    approvedIqd,
    estimateLabel,
    approvedLabel,
    needsManualPricing,
  };
}

/**
 * The number to put in front of the customer right now.
 *
 * The approved price once there is one, otherwise the estimate — and the caller
 * is told which it got, so it can label it honestly rather than presenting an
 * estimate as a commitment.
 */
export function customerFacingPrice(row: TradePricingRow): {
  amountIqd: number | null;
  isApproved: boolean;
  label: string;
} {
  const view = readTradePricing(row);
  if (view.approvedIqd !== null) {
    return { amountIqd: view.approvedIqd, isApproved: true, label: "السعر النهائي المعتمد" };
  }
  return { amountIqd: view.estimateIqd, isApproved: false, label: "السعر التقريبي" };
}
