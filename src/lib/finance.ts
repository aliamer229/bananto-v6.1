/**
 * What an order was actually worth to the business.
 *
 * ## The four things the old figure got wrong
 *
 * The admin's profit tile was `Σ order.total − Σ (current product cost × qty)`.
 * Four separate errors, all of which push profit the same way — up:
 *
 * 1. **`order.total` includes delivery.** Checkout builds it as
 *    `itemsTotal − discount + deliveryPrice`. The delivery fee is collected on
 *    behalf of the courier; counting it as product revenue inflates profit by
 *    the entire shipping charge on every physical order.
 *
 * 2. **Cost was read from the catalogue as it is *today*.** An order placed
 *    when a game cost 4,000 IQD was being valued at whatever the supplier
 *    charges now — so re-pricing a product silently rewrote the profit on every
 *    order ever placed for it. Costs are now taken from the snapshot recorded
 *    on the line at checkout; the current catalogue is a fallback for orders
 *    placed before snapshots existed, and any total that leans on it is marked
 *    estimated rather than quietly presented as fact.
 *
 * 3. **Cancelled orders counted as revenue** whenever they had been paid before
 *    being cancelled — which is exactly when they were refunded to the member's
 *    wallet. Money that went back out is not margin.
 *
 * 4. **The discount was invisible.** `order.total` is already net of the
 *    coupon, so the total was not wrong — but with no gross and no discount
 *    line there was no way to see that a month's margin had gone to coupons,
 *    which is the question the tile exists to answer.
 *
 * ## Wallet orders are not free
 *
 * A wallet-paid order arrives with `paymentStatus: "paid"` and a real total.
 * The member paid; the money simply moved earlier, when they topped the wallet
 * up. Treating the payment method as the revenue event would report zero profit
 * for the store's most common checkout.
 */

/** A line as it was recorded on the order. */
export interface FinanceLine {
  productId?: string | number;
  quantity?: number;
  unitPrice?: number;
  /** Cost per unit, snapshotted at checkout. Absent on older orders. */
  unitCost?: number;
}

export interface FinanceOrder {
  id?: string;
  items?: FinanceLine[];
  total?: number;
  discountAmount?: number;
  /** Partial refund, when one has been recorded against the order. */
  refundedAmount?: number;
  status?: string;
  paymentStatus?: string;
  needsAddress?: boolean;
  createdAt?: string;
  completedAt?: string;
}

export interface OrderFinance {
  /** Product revenue before any coupon. */
  gross: number;
  /** Coupon value given away. */
  discount: number;
  /** What the customer paid for goods: `gross − discount − refunds`. */
  net: number;
  /** Collected for delivery. Never counted as product revenue or as margin. */
  shipping: number;
  /** Cost of the goods sold, from the snapshots on the lines. */
  cost: number;
  /** `net − cost`. */
  profit: number;
  /** Money handed back after the sale. */
  refunded: number;
  /** True when any line had no cost snapshot and fell back to the catalogue. */
  costIsEstimated: boolean;
  /** Whether this order contributes to the totals at all. */
  counted: boolean;
}

const ZERO: OrderFinance = {
  gross: 0,
  discount: 0,
  net: 0,
  shipping: 0,
  cost: 0,
  profit: 0,
  refunded: 0,
  costIsEstimated: false,
  counted: false,
};

function money(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function qty(value: unknown): number {
  const n = Math.floor(money(value));
  return n > 0 ? n : 0;
}

/**
 * Does this order represent money the business took and kept?
 *
 * `cancelled` is excluded outright: the cancel flow refunds a wallet-paid order
 * in full, so a cancelled order is a round trip, not a sale. Everything else
 * that is paid counts, and `completed` counts even without a payment record so
 * that manually-entered and legacy-imported orders are not silently dropped
 * from the books.
 */
export function isRevenueOrder(order: FinanceOrder | null | undefined): boolean {
  if (!order) return false;
  const status = String(order.status ?? "");
  const payment = String(order.paymentStatus ?? "");
  if (status === "cancelled") return false;
  if (payment === "rejected") return false;
  return payment === "paid" || status === "completed";
}

/** Cost per unit for a line: the snapshot, or the catalogue as it stands now. */
function lineCost(
  line: FinanceLine,
  currentCostOf: (productId: unknown) => number | undefined,
): { cost: number; estimated: boolean } {
  if (typeof line.unitCost === "number" && Number.isFinite(line.unitCost) && line.unitCost >= 0) {
    return { cost: line.unitCost, estimated: false };
  }
  const fallback = currentCostOf(line.productId);
  return { cost: money(fallback), estimated: true };
}

/**
 * Breaks one order down into the figures the finance view reports.
 *
 * `currentCostOf` is only consulted for lines with no cost snapshot, and every
 * such consultation sets `costIsEstimated`.
 */
export function orderFinance(
  order: FinanceOrder | null | undefined,
  currentCostOf: (productId: unknown) => number | undefined = () => undefined,
): OrderFinance {
  if (!isRevenueOrder(order) || !order) return ZERO;

  const lines = Array.isArray(order.items) ? order.items : [];
  let gross = 0;
  let cost = 0;
  let costIsEstimated = false;

  for (const line of lines) {
    const units = qty(line.quantity);
    if (!units) continue;
    gross += money(line.unitPrice) * units;
    const resolved = lineCost(line, currentCostOf);
    cost += resolved.cost * units;
    if (resolved.estimated && resolved.cost > 0) costIsEstimated = true;
  }

  // A coupon cannot give back more than the goods were worth.
  const discount = Math.min(Math.max(0, money(order.discountAmount)), gross);

  /*
    Shipping is derived rather than stored: checkout builds `total` as
    `gross − discount + delivery`, so whatever the total exceeds the discounted
    goods by is the delivery charge. Deriving it keeps this correct for orders
    written before any of this existed, and clamping at zero means a total that
    disagrees with its own lines cannot invent negative shipping.
  */
  const recordedTotal = money(order.total);
  const shipping = order.needsAddress === false ? 0 : Math.max(0, recordedTotal - (gross - discount));

  const refunded = Math.min(Math.max(0, money(order.refundedAmount)), gross - discount);
  const net = gross - discount - refunded;

  return {
    gross,
    discount,
    net,
    shipping,
    cost,
    profit: net - cost,
    refunded,
    costIsEstimated,
    counted: true,
  };
}

export interface FinanceTotals extends Omit<OrderFinance, "counted"> {
  /** How many orders contributed. */
  orders: number;
  /** How many of those had at least one line without a cost snapshot. */
  ordersWithEstimatedCost: number;
  /** `profit / net`, or `null` when nothing was sold. */
  margin: number | null;
}

/** Adds up a set of orders. */
export function financeTotals(
  orders: readonly FinanceOrder[],
  currentCostOf: (productId: unknown) => number | undefined = () => undefined,
): FinanceTotals {
  const totals: FinanceTotals = {
    gross: 0,
    discount: 0,
    net: 0,
    shipping: 0,
    cost: 0,
    profit: 0,
    refunded: 0,
    costIsEstimated: false,
    orders: 0,
    ordersWithEstimatedCost: 0,
    margin: null,
  };

  for (const order of orders) {
    const row = orderFinance(order, currentCostOf);
    if (!row.counted) continue;
    totals.orders += 1;
    totals.gross += row.gross;
    totals.discount += row.discount;
    totals.net += row.net;
    totals.shipping += row.shipping;
    totals.cost += row.cost;
    totals.profit += row.profit;
    totals.refunded += row.refunded;
    if (row.costIsEstimated) {
      totals.costIsEstimated = true;
      totals.ordersWithEstimatedCost += 1;
    }
  }

  totals.margin = totals.net > 0 ? totals.profit / totals.net : null;
  return totals;
}

/**
 * Splits an order-level discount across its lines, for per-product reporting.
 *
 * Pro-rata by line value, with the rounding remainder handed to the largest
 * lines first so the parts sum to exactly the discount. Without that, rounding
 * each line independently leaves a few dinars unallocated on most orders, and
 * per-product profit stops reconciling with the order totals.
 *
 * This is an **allocation, not a record**. A coupon restricted to one product
 * really did come off that one line, but the order stores only the code and the
 * amount, so which line it hit is not recoverable. Order-level totals never
 * depend on this — `net` is `gross − discount` however the parts fall.
 */
export function allocateDiscount(
  lines: readonly FinanceLine[],
  discountAmount: number,
): number[] {
  const values = lines.map((line) => money(line.unitPrice) * qty(line.quantity));
  const gross = values.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(Math.max(0, money(discountAmount)), gross);
  if (!gross || !discount) return values.map(() => 0);

  const exact = values.map((value) => (value / gross) * discount);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = Math.round(discount - floors.reduce((sum, value) => sum + value, 0));

  // Largest fractional part first, so the leftover dinars land where they are
  // least visible rather than always on line one.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const out = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    out[index] = (out[index] ?? 0) + 1;
    remainder -= 1;
  }
  return out;
}
