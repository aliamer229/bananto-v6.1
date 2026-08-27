import { describe, expect, it } from "vitest";

import {
  allocateDiscount,
  financeTotals,
  isRevenueOrder,
  orderFinance,
  type FinanceOrder,
} from "./finance";

/**
 * The catalogue *as it stands today* — deliberately different from what these
 * orders were placed at, because that difference is the bug.
 */
const currentCost = (id: unknown) =>
  ({ "game-a": 9999, "game-b": 8888 })[String(id)];

const paid = (over: Partial<FinanceOrder> = {}): FinanceOrder => ({
  id: "ord_1",
  status: "completed",
  paymentStatus: "paid",
  needsAddress: false,
  items: [{ productId: "game-a", quantity: 1, unitPrice: 22000, unitCost: 4000 }],
  total: 22000,
  ...over,
});

describe("A — a plain paid order", () => {
  it("is net of nothing, and profit is price minus the snapshotted cost", () => {
    const f = orderFinance(paid(), currentCost);
    expect(f.gross).toBe(22000);
    expect(f.discount).toBe(0);
    expect(f.net).toBe(22000);
    expect(f.cost).toBe(4000);
    expect(f.profit).toBe(18000);
    expect(f.costIsEstimated).toBe(false);
  });
});

describe("B — an order with a coupon", () => {
  const order = paid({ discountAmount: 5000, couponCode: "EID25", total: 17000 } as never);

  it("counts the customer's discounted payment as revenue, not the list price", () => {
    const f = orderFinance(order, currentCost);
    expect(f.gross).toBe(22000);
    expect(f.discount).toBe(5000);
    expect(f.net).toBe(17000);
    // The old figure was gross − cost = 18,000. The coupon came out of margin.
    expect(f.profit).toBe(13000);
  });

  it("cannot discount more than the goods were worth", () => {
    const f = orderFinance(paid({ discountAmount: 999999, total: 0 }), currentCost);
    expect(f.discount).toBe(22000);
    expect(f.net).toBe(0);
    expect(f.profit).toBe(-4000);
  });
});

describe("C — a physical order with delivery", () => {
  const order = paid({
    needsAddress: true,
    items: [{ productId: "game-b", quantity: 1, unitPrice: 30000, unitCost: 20000 }],
    total: 35000, // 30,000 goods + 5,000 delivery
  });

  it("keeps the delivery fee out of revenue and out of profit", () => {
    const f = orderFinance(order, currentCost);
    expect(f.gross).toBe(30000);
    expect(f.shipping).toBe(5000);
    expect(f.net).toBe(30000);
    // The old figure used `order.total`, so it booked the courier's 5,000 as
    // margin: 35,000 − 20,000 = 15,000.
    expect(f.profit).toBe(10000);
  });

  it("still separates delivery when a coupon is also applied", () => {
    const f = orderFinance({ ...order, discountAmount: 3000, total: 32000 }, currentCost);
    expect(f.gross).toBe(30000);
    expect(f.discount).toBe(3000);
    expect(f.shipping).toBe(5000);
    expect(f.net).toBe(27000);
    expect(f.profit).toBe(7000);
  });
});

describe("D — a cancelled order", () => {
  it("contributes nothing even though it was paid before being cancelled", () => {
    // Which is precisely when it was refunded to the member's wallet.
    const f = orderFinance(paid({ status: "cancelled" }), currentCost);
    expect(f.counted).toBe(false);
    expect(f.profit).toBe(0);
    expect(isRevenueOrder(paid({ status: "cancelled" }))).toBe(false);
  });

  it("drops an order whose payment was rejected", () => {
    expect(isRevenueOrder(paid({ paymentStatus: "rejected", status: "processing" }))).toBe(false);
  });

  it("keeps an unpaid order out of the books until it is completed", () => {
    expect(isRevenueOrder(paid({ paymentStatus: "unpaid", status: "processing" }))).toBe(false);
    // Manually entered and legacy-imported orders reach `completed` without a
    // payment record; dropping those would quietly shrink the books.
    expect(isRevenueOrder(paid({ paymentStatus: "unpaid", status: "completed" }))).toBe(true);
  });
});

describe("E — a partial refund", () => {
  it("comes out of revenue and therefore out of profit", () => {
    const f = orderFinance(paid({ refundedAmount: 6000 }), currentCost);
    expect(f.refunded).toBe(6000);
    expect(f.net).toBe(16000);
    expect(f.profit).toBe(12000);
  });

  it("cannot refund more than the customer paid", () => {
    const f = orderFinance(paid({ discountAmount: 2000, refundedAmount: 999999 }), currentCost);
    expect(f.refunded).toBe(20000);
    expect(f.net).toBe(0);
  });
});

describe("F — an order placed before cost snapshots existed", () => {
  const legacy = paid({
    items: [{ productId: "game-a", quantity: 2, unitPrice: 22000 }],
    total: 44000,
  });

  it("falls back to the catalogue, and says so", () => {
    const f = orderFinance(legacy, currentCost);
    expect(f.cost).toBe(9999 * 2);
    expect(f.costIsEstimated).toBe(true);
  });

  it("never re-prices an order that does carry snapshots", () => {
    // Re-pricing a product used to rewrite the profit on every order ever
    // placed for it, retroactively.
    const f = orderFinance(paid(), currentCost);
    expect(f.cost).toBe(4000);
    expect(f.cost).not.toBe(9999);
  });

  it("marks the totals estimated when any order leaned on the catalogue", () => {
    const totals = financeTotals([paid(), legacy], currentCost);
    expect(totals.costIsEstimated).toBe(true);
    expect(totals.ordersWithEstimatedCost).toBe(1);
    expect(totals.orders).toBe(2);
  });
});

describe("wallet orders are real revenue", () => {
  it("does not treat the payment method as the revenue event", () => {
    // The member paid; the money moved earlier, when they topped up. Reporting
    // zero profit here would zero out the store's most common checkout.
    const wallet = paid({ paymentStatus: "paid", status: "processing" });
    const f = orderFinance(wallet, currentCost);
    expect(f.counted).toBe(true);
    expect(f.net).toBe(22000);
    expect(f.profit).toBe(18000);
  });
});

describe("totals", () => {
  const orders: FinanceOrder[] = [
    paid({ id: "a" }),
    paid({ id: "b", discountAmount: 5000, total: 17000 }),
    paid({ id: "c", status: "cancelled" }),
    paid({
      id: "d",
      needsAddress: true,
      items: [{ productId: "game-b", quantity: 1, unitPrice: 30000, unitCost: 20000 }],
      total: 35000,
    }),
  ];

  it("adds up only the orders that count", () => {
    const t = financeTotals(orders, currentCost);
    expect(t.orders).toBe(3);
    expect(t.gross).toBe(22000 + 22000 + 30000);
    expect(t.discount).toBe(5000);
    expect(t.net).toBe(22000 + 17000 + 30000);
    expect(t.cost).toBe(4000 + 4000 + 20000);
    expect(t.profit).toBe(t.net - t.cost);
    expect(t.shipping).toBe(5000);
  });

  it("reports a margin, and nothing at all when nothing sold", () => {
    const t = financeTotals(orders, currentCost);
    expect(t.margin).toBeCloseTo(t.profit / t.net, 10);
    expect(financeTotals([], currentCost).margin).toBeNull();
  });

  it("keeps net = gross − discount − refunds as an identity", () => {
    const t = financeTotals(orders, currentCost);
    expect(t.net).toBe(t.gross - t.discount - t.refunded);
    expect(t.profit).toBe(t.net - t.cost);
  });
});

describe("allocating an order discount across its lines", () => {
  const lines = [
    { productId: "a", quantity: 1, unitPrice: 10000 },
    { productId: "b", quantity: 2, unitPrice: 5000 },
    { productId: "c", quantity: 1, unitPrice: 5000 },
  ];

  it("splits pro-rata by line value", () => {
    expect(allocateDiscount(lines, 5000)).toEqual([2000, 2000, 1000]);
  });

  it("sums to exactly the discount even when it does not divide evenly", () => {
    // Rounding each line independently leaves dinars unallocated, and then
    // per-product profit stops reconciling with the order total.
    for (const discount of [1, 7, 333, 1234, 9999]) {
      const parts = allocateDiscount(lines, discount);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(discount);
    }
  });

  it("gives nothing away on an order with no discount, and no line anything on an empty order", () => {
    expect(allocateDiscount(lines, 0)).toEqual([0, 0, 0]);
    expect(allocateDiscount([], 5000)).toEqual([]);
  });

  it("never allocates more than the goods were worth", () => {
    // 10,000 + 2 x 5,000 + 5,000.
    const parts = allocateDiscount(lines, 999999);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(25000);
  });
});

/**
 * How the reckoning is wired into checkout and into the admin screens.
 *
 * Source assertions, in the style this repo uses for what a unit test cannot
 * reach. The admin screens are not exercised in a logged-in browser here: the
 * local environment has no database schema, so no admin session can exist.
 */
describe("the wiring", () => {
  const read = async (p: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), p), "utf8");
  };

  it("records a cost snapshot on every order line at checkout", async () => {
    const CHECKOUT = await read("src/lib/orders.server.ts");
    // Both line builders: catalogue products and bundles.
    expect(CHECKOUT.match(/unitCost/g)?.length).toBeGreaterThanOrEqual(3);
    expect(CHECKOUT).toContain("const unitCost =");
  });

  it("resolves the cost the same way it resolved the price", async () => {
    const CHECKOUT = await read("src/lib/orders.server.ts");
    // A variant that carries its own cost is what the line actually cost us;
    // taking the product's headline figure would misprice every variant sale.
    const block = CHECKOUT.slice(CHECKOUT.indexOf("const unitCost ="));
    expect(block.slice(0, 260)).toContain("selectedType");
    expect(block.slice(0, 260)).toContain("selectedOption");
  });

  it("no longer values old orders at today's catalogue cost", async () => {
    const UI = await read("src/components/AdminDashboard.tsx");
    // The old line was `(p?.cost || 0) * item.quantity` against a `products`
    // lookup, applied unconditionally.
    expect(UI).not.toContain("(p?.cost || 0) * item.quantity");
    expect(UI).toContain("financeTotals(");
  });

  it("stops booking the courier's delivery fee as revenue", async () => {
    const UI = await read("src/components/AdminDashboard.tsx");
    expect(UI).not.toContain("sum + o.total");
    expect(UI).not.toContain("(Number(o?.total) || 0)");
  });

  it("shows the chain, not just one number", async () => {
    const UI = await read("src/components/AdminDashboard.tsx");
    for (const field of ["totals.gross", "totals.discount", "totals.net", "totals.cost", "totals.profit"]) {
      expect(UI).toContain(field);
    }
    // And says so when part of the cost is a guess.
    expect(UI).toContain("totals.costIsEstimated");
  });
});

/**
 * The case matrix exactly as specified, with the specified numbers.
 *
 * The suites above cover the same ground with the store's real figures; these
 * are the literal cases, kept separate so the spec can be read off the file.
 */
describe("specified case matrix", () => {
  const line = (productId: string, price: number, cost: number, quantity = 1) => ({
    productId,
    quantity,
    unitPrice: price,
    unitCost: cost,
  });
  const order = (over: Partial<FinanceOrder>): FinanceOrder => ({
    status: "completed",
    paymentStatus: "paid",
    needsAddress: false,
    ...over,
  });

  it("CASE A — price 10,000, cost 1,000, no discount, profit 9,000", () => {
    const f = orderFinance(order({ items: [line("p1", 10000, 1000)], total: 10000 }));
    expect(f.net).toBe(10000);
    expect(f.cost).toBe(1000);
    expect(f.profit).toBe(9000);
  });

  it("CASE B — 50% discount: net 5,000, profit 4,000", () => {
    const f = orderFinance(
      order({ items: [line("p1", 10000, 1000)], discountAmount: 5000, total: 5000 }),
    );
    expect(f.gross).toBe(10000);
    expect(f.discount).toBe(5000);
    expect(f.net).toBe(5000);
    expect(f.profit).toBe(4000);
  });

  it("CASE C — 10,000 + 20,000 with a 9,000 order discount: net 21,000, allocation exact", () => {
    const items = [line("p1", 10000, 1000), line("p2", 20000, 2000)];
    const f = orderFinance(order({ items, discountAmount: 9000, total: 21000 }));
    expect(f.gross).toBe(30000);
    expect(f.net).toBe(21000);

    const parts = allocateDiscount(items, 9000);
    // Pro-rata: one third and two thirds of 9,000.
    expect(parts).toEqual([3000, 6000]);
    expect(parts[0]! + parts[1]!).toBe(9000);
  });

  it("CASE D — a discount limited to one product leaves the other untouched", () => {
    const items = [line("p1", 10000, 1000), line("p2", 20000, 2000)];
    const parts = allocateDiscount(items, 9000, "p2");
    expect(parts).toEqual([0, 9000]);

    // And the other way round, so this is not an artefact of ordering.
    expect(allocateDiscount(items, 4000, "p1")).toEqual([4000, 0]);

    // Order totals are unchanged by which line it came off.
    const f = orderFinance(
      order({ items, discountAmount: 9000, couponTargetProductId: "p2", total: 21000 }),
    );
    expect(f.net).toBe(21000);
    expect(f.profit).toBe(21000 - 3000);
  });

  it("CASE E — a full refund reverses revenue and profit", () => {
    const items = [line("p1", 10000, 1000)];
    const f = orderFinance(order({ items, refundedAmount: 10000, total: 10000 }));
    expect(f.net).toBe(0);
    expect(f.profit).toBe(-1000); // the goods were still bought
    // A cancelled order is the other shape of a full refund: it drops out.
    const cancelled = orderFinance(order({ items, status: "cancelled", total: 10000 }));
    expect(cancelled.counted).toBe(false);
    expect(cancelled.net).toBe(0);
  });

  it("CASE F — a partial refund leaves profit on the retained revenue", () => {
    const f = orderFinance(
      order({ items: [line("p1", 10000, 1000)], refundedAmount: 4000, total: 10000 }),
    );
    expect(f.refunded).toBe(4000);
    expect(f.net).toBe(6000);
    expect(f.profit).toBe(5000);
  });

  it("records which line a single-product coupon came off, so D is data and not a guess", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const CHECKOUT = readFileSync(resolve(process.cwd(), "src/lib/orders.server.ts"), "utf8");
    // Checkout already resolved the target to compute the discount; it now
    // persists it rather than throwing it away.
    expect(CHECKOUT).toContain("couponTargetProductId: appliedTargetProductId");
  });
});
