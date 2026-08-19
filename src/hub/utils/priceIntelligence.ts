import type { CurrencyCode, PriceHistory, PricePoint, StoreOffer } from "@/hub/types";

/**
 * Derived price insight.
 *
 * Everything here is computed from recorded price points — nothing is
 * estimated, smoothed or predicted. When the series is too short to support a
 * claim, the helpers return `null` and the UI stays silent instead of guessing.
 */

export type HistoryWindow = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

export const HISTORY_WINDOWS: Array<{ id: HistoryWindow; days: number | null }> = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "3m", days: 90 },
  { id: "6m", days: 180 },
  { id: "1y", days: 365 },
  { id: "all", days: null },
];

export interface WindowStats {
  window: HistoryWindow;
  points: PricePoint[];
  current: number;
  low: { price: number; date: string };
  high: { price: number; date: string };
  average: number;
  currency: CurrencyCode;
}

export function pointsInWindow(points: PricePoint[], window: HistoryWindow): PricePoint[] {
  const spec = HISTORY_WINDOWS.find((w) => w.id === window);
  if (!spec?.days) return [...points];
  const cutoff = Date.now() - spec.days * 86400_000;
  const inRange = points.filter((p) => new Date(p.date).getTime() >= cutoff);
  // A window with a single sample cannot describe a trend; fall back to the
  // last two known points so the chart still draws a real segment.
  return inRange.length >= 2 ? inRange : points.slice(-2);
}

export function computeWindowStats(
  history: PriceHistory | undefined,
  window: HistoryWindow,
): WindowStats | null {
  if (!history || history.points.length === 0) return null;

  const sorted = [...history.points].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const points = pointsInWindow(sorted, window);
  if (points.length === 0) return null;

  const first = points[0];
  if (!first) return null;
  let low = first;
  let high = first;
  let sum = 0;
  for (const p of points) {
    if (p.price < low.price) low = p;
    if (p.price > high.price) high = p;
    sum += p.price;
  }

  const lastPoint = sorted[sorted.length - 1];
  if (!lastPoint) return null;

  return {
    window,
    points,
    current: lastPoint.price,
    low: { price: low.price, date: low.date },
    high: { price: high.price, date: high.date },
    average: sum / points.length,
    currency: history.currency,
  };
}

export type PriceVerdictId = "great" | "good" | "average" | "wait";

export interface PriceVerdict {
  id: PriceVerdictId;
  /** Negative = below average (good for the buyer). */
  deltaFromAverage: number;
  /** Current price is the lowest ever recorded. */
  isAllTimeLow: boolean;
  /** Distance from the all-time low, as a ratio (0 = matching the low). */
  aboveLowRatio: number | null;
}

/**
 * Classifies the current price against its own history.
 *
 * Thresholds are intentionally conservative: a price only earns "Great" when it
 * is both meaningfully under the window average *and* close to the recorded
 * low, so a shallow discount on an inflated list price cannot dress itself up.
 */
export function computePriceVerdict(
  stats: WindowStats,
  allTimeLow?: { price: number; date: string },
): PriceVerdict {
  const deltaFromAverage = stats.average > 0 ? (stats.current - stats.average) / stats.average : 0;
  const low = allTimeLow?.price ?? stats.low.price;
  const aboveLowRatio = low > 0 ? (stats.current - low) / low : null;
  const isAllTimeLow = stats.current <= low + 0.001;

  let id: PriceVerdictId;
  if (isAllTimeLow || (deltaFromAverage <= -0.2 && (aboveLowRatio ?? 1) <= 0.1)) {
    id = "great";
  } else if (deltaFromAverage <= -0.08) {
    id = "good";
  } else if (deltaFromAverage < 0.05) {
    id = "average";
  } else {
    id = "wait";
  }

  return { id, deltaFromAverage, isAllTimeLow, aboveLowRatio };
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                     */
/* -------------------------------------------------------------------------- */

export interface RankedOffer {
  offer: StoreOffer;
  /** Price converted into the viewer's display currency. */
  displayAmount: number;
  displayCurrency: CurrencyCode;
  isBest: boolean;
}

type Converter = (amount: number, from: CurrencyCode, to: CurrencyCode) => number;

/**
 * Ranks purchasable offers by converted price.
 *
 * Unavailable and delisted offers are kept (users still want to see them) but
 * are never eligible to be "best price".
 */
export function rankOffers(
  offers: StoreOffer[],
  displayCurrency: CurrencyCode,
  convert: Converter,
): RankedOffer[] {
  const ranked = offers.map((offer) => ({
    offer,
    displayAmount: convert(offer.price.amount, offer.price.currency, displayCurrency),
    displayCurrency,
    isBest: false,
  }));

  ranked.sort((a, b) => {
    const aBuyable = isBuyable(a.offer);
    const bBuyable = isBuyable(b.offer);
    if (aBuyable !== bBuyable) return aBuyable ? -1 : 1;
    return a.displayAmount - b.displayAmount;
  });

  const best = ranked.find((r) => isBuyable(r.offer));
  if (best) best.isBest = true;
  return ranked;
}

export function isBuyable(offer: StoreOffer): boolean {
  return (
    offer.availability === "in-stock" ||
    offer.availability === "low-stock" ||
    offer.availability === "preorder"
  );
}

/** Most recent successful fetch across a set of offers, for the freshness label. */
export function latestUpdatedAt(offers: StoreOffer[]): string | null {
  let latest: number | null = null;
  for (const offer of offers) {
    const t = new Date(offer.updatedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

/**
 * Suggests a target for the price-alert field: the recorded all-time low, or a
 * modest step under the current price when no low is known. Never invents a
 * price the game has not actually reached.
 */
export function suggestAlertTarget(
  stats: WindowStats | null,
  allTimeLow?: { price: number },
): number | null {
  if (allTimeLow?.price) return round2(allTimeLow.price);
  if (!stats) return null;
  return round2(Math.min(stats.low.price, stats.current * 0.85));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
