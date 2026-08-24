import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkCoupon, couponDiscount, getEligibleItems, rowToCoupon } from "./coupons";
import type { CouponCheckItem } from "./coupons";
import { isOfflineAccountSelection, isOnlineAccountSelection } from "./offlineAccount";

/* -------------------------------------------------------------------------- */
/*  Recognising the selection                                                  */
/* -------------------------------------------------------------------------- */

describe("recognising an offline-account selection", () => {
  it("accepts every spelling the catalogue actually stores", () => {
    // The import template's canonical ids.
    expect(isOfflineAccountSelection({ optionId: "offline_account" })).toBe(true);
    expect(isOfflineAccountSelection({ typeId: "standard_offline" })).toBe(true);
    expect(isOfflineAccountSelection({ typeId: "dlc_offline" })).toBe(true);
    // An option added by hand: the id is generated, the meaning is in the name.
    expect(isOfflineAccountSelection({ optionId: "opt_17a3f", optionName: "حساب أوفلاين" })).toBe(
      true,
    );
    expect(isOfflineAccountSelection({ optionName: "حساب اوفلاين" })).toBe(true);
    expect(isOfflineAccountSelection({ optionName: "Offline Account" })).toBe(true);
    expect(isOfflineAccountSelection({ optionName: "OFFLINE" })).toBe(true);
    // The product's own kind can carry it.
    expect(isOfflineAccountSelection({ kind: "offline_account" })).toBe(true);
  });

  it("never mistakes the online option for it", () => {
    expect(isOfflineAccountSelection({ optionId: "online_account" })).toBe(false);
    expect(isOfflineAccountSelection({ optionName: "حساب أونلاين" })).toBe(false);
    expect(isOfflineAccountSelection({ typeId: "standard_online" })).toBe(false);
    expect(isOfflineAccountSelection({ kind: "online_account" })).toBe(false);
    expect(isOnlineAccountSelection({ optionId: "online_account" })).toBe(true);
    expect(isOnlineAccountSelection({ optionId: "offline_account" })).toBe(false);
  });

  it("refuses a line that names both, rather than guessing", () => {
    expect(
      isOfflineAccountSelection({ optionId: "offline_account", typeId: "standard_online" }),
    ).toBe(false);
  });

  it("says no when there is nothing to go on", () => {
    expect(isOfflineAccountSelection({})).toBe(false);
    expect(isOfflineAccountSelection(null)).toBe(false);
    expect(isOfflineAccountSelection({ kind: "hardware" })).toBe(false);
    expect(isOfflineAccountSelection({ kind: "bundle" })).toBe(false);
    expect(isOfflineAccountSelection({ kind: "account" })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** The coupon this request is about: 50% off one offline game, once per member. */
const offlineCoupon = () =>
  rowToCoupon({
    id: "cpn_offline",
    code: "OFFLINE50",
    discount_type: "single_item_percent",
    discount_value: 50,
    per_user_limit: 1,
    once_per_user_lifetime: 1,
    offline_account_only: 1,
    is_active: 1,
  });

const offlineGame = (over: Partial<CouponCheckItem> = {}): CouponCheckItem => ({
  productId: "prd_zelda",
  title: "Zelda",
  kind: "account",
  unitPrice: 30000,
  quantity: 1,
  optionId: "offline_account",
  optionName: "حساب أوفلاين",
  typeId: "standard_offline",
  ...over,
});

const onlineGame = (over: Partial<CouponCheckItem> = {}): CouponCheckItem => ({
  productId: "prd_mario",
  title: "Mario",
  kind: "account",
  unitPrice: 50000,
  quantity: 1,
  optionId: "online_account",
  optionName: "حساب أونلاين",
  typeId: "standard_online",
  ...over,
});

const hardware = (): CouponCheckItem => ({
  productId: "prd_console",
  title: "Switch 2",
  kind: "hardware",
  unitPrice: 400000,
  quantity: 1,
});

const bundle = (): CouponCheckItem => ({
  productId: "bnd_1",
  title: "Bundle",
  kind: "bundle",
  unitPrice: 90000,
  quantity: 1,
});

const check = (items: CouponCheckItem[], over: Record<string, unknown> = {}) =>
  checkCoupon({
    coupon: offlineCoupon(),
    userId: "user_a",
    orderAmount: items.reduce((sum, it) => sum + (it.unitPrice ?? 0) * (it.quantity ?? 1), 0),
    items,
    globalUses: 0,
    userUses: 0,
    lifetimeSingleItemUses: 0,
    ...over,
  });

/* -------------------------------------------------------------------------- */
/*  What the coupon applies to                                                 */
/* -------------------------------------------------------------------------- */

describe("the coupon applies only to an offline-account game", () => {
  it("accepts a cart holding one offline game", () => {
    const verdict = check([offlineGame()]);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.targetProduct?.productId).toBe("prd_zelda");
  });

  it("refuses an online-account game, however expensive", () => {
    const verdict = check([onlineGame()]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no_offline_account_item");
  });

  it("refuses hardware and bundles", () => {
    expect(check([hardware()]).ok).toBe(false);
    expect(check([bundle()]).ok).toBe(false);
    expect(check([hardware(), bundle(), onlineGame()]).ok).toBe(false);
  });

  it("refuses a game with no option recorded at all", () => {
    const verdict = check([offlineGame({ optionId: null, optionName: null, typeId: null })]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no_offline_account_item");
  });

  it("picks the offline line out of a mixed cart, never the pricier online one", () => {
    const items = [onlineGame(), hardware(), offlineGame()];
    expect(getEligibleItems(offlineCoupon(), items).map((it) => it.productId)).toEqual([
      "prd_zelda",
    ]);

    const verdict = check(items);
    expect(verdict.ok).toBe(true);
    // The online game costs more; sorting by price must not reach it.
    if (verdict.ok) expect(verdict.targetProduct?.productId).toBe("prd_zelda");
  });
});

/* -------------------------------------------------------------------------- */
/*  One game, one copy                                                         */
/* -------------------------------------------------------------------------- */

describe("the discount covers exactly one copy of one game", () => {
  it("discounts a single unit even when the line has quantity 3", () => {
    const items = [offlineGame({ quantity: 3 })];
    const result = couponDiscount(offlineCoupon(), 90000, items);
    // 50% of one 30,000 unit — not of the 90,000 line.
    expect(result.discount).toBe(15000);
    expect(result.singleUnitPrice).toBe(30000);
    expect(result.targetProductId).toBe("prd_zelda");
  });

  it("discounts one line only when the cart holds two offline games", () => {
    const second = offlineGame({ productId: "prd_metroid", title: "Metroid", unitPrice: 40000 });
    const result = couponDiscount(offlineCoupon(), 70000, [offlineGame(), second]);
    // One line, one unit: 50% of 40,000, not of both.
    expect(result.discount).toBe(20000);
    expect(result.targetProductId).toBe("prd_metroid");
  });

  it("ignores the online and hardware lines when sizing the discount", () => {
    const items = [onlineGame(), hardware(), offlineGame()];
    const total = 50000 + 400000 + 30000;
    const result = couponDiscount(offlineCoupon(), total, items);
    expect(result.discount).toBe(15000);
    expect(result.targetProductId).toBe("prd_zelda");
  });

  it("gives nothing at all when no line qualifies", () => {
    expect(couponDiscount(offlineCoupon(), 450000, [onlineGame(), hardware()]).discount).toBe(0);
  });

  it("takes a fixed-amount offline coupon off one unit, never the whole order", () => {
    const fixed = rowToCoupon({
      id: "cpn_fixed",
      code: "OFF5K",
      discount_type: "fixed",
      discount_value: 5000,
      offline_account_only: 1,
      is_active: 1,
    });
    const result = couponDiscount(fixed, 90000, [offlineGame({ quantity: 3 })]);
    expect(result.discount).toBe(5000);
    expect(result.targetProductId).toBe("prd_zelda");
  });

  it("never discounts more than the unit is worth", () => {
    const fixed = rowToCoupon({
      id: "cpn_fixed",
      code: "OFF99K",
      discount_type: "fixed",
      discount_value: 99000,
      offline_account_only: 1,
      is_active: 1,
    });
    const result = couponDiscount(fixed, 30000, [offlineGame()]);
    expect(result.discount).toBe(30000);
  });
});

/* -------------------------------------------------------------------------- */
/*  Once per member, not once in total                                         */
/* -------------------------------------------------------------------------- */

describe("one use per member", () => {
  it("member A: first use accepted, second refused", () => {
    expect(check([offlineGame()], { userId: "user_a", userUses: 0 }).ok).toBe(true);

    const second = check([offlineGame()], {
      userId: "user_a",
      userUses: 1,
      lifetimeSingleItemUses: 1,
      globalUses: 1,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("lifetime_single_item_used");
  });

  it("member B is unaffected by member A having used it", () => {
    // Member A's redemption raises the global count; B's own count is still 0.
    const verdict = check([offlineGame()], {
      userId: "user_b",
      userUses: 0,
      lifetimeSingleItemUses: 0,
      globalUses: 1,
    });
    expect(verdict.ok).toBe(true);
  });

  it("stays open to everyone while no global cap is set", () => {
    for (const globalUses of [1, 5, 50, 5000]) {
      expect(check([offlineGame()], { userId: "user_new", globalUses }).ok).toBe(true);
    }
  });

  it("member B still gets nothing for an online game", () => {
    const verdict = check([onlineGame()], { userId: "user_b", globalUses: 1 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no_offline_account_item");
  });
});

/* -------------------------------------------------------------------------- */
/*  Recording a use is atomic and happens at checkout                          */
/* -------------------------------------------------------------------------- */

interface UsageRow {
  coupon_id: string;
  user_id: string;
  uses: number;
}

const usage = new Map<string, UsageRow>();
const totals = new Map<string, number>();
const key = (couponId: string, userId: string) => `${couponId}::${userId}`;

vi.mock("./d1.server", () => ({
  d1All: async () => [],
  d1First: async () => null,
  d1Run: async (sql: string, ...binds: unknown[]) => {
    if (/UPDATE coupons SET total_uses = COALESCE/i.test(sql)) {
      const id = String(binds[0]);
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    if (/UPDATE coupon_user_usage SET uses = MAX/i.test(sql)) {
      const row = usage.get(key(String(binds[0]), String(binds[1])));
      if (row) row.uses = Math.max(0, row.uses - 1);
    }
    return undefined;
  },
  d1RunChanges: async (sql: string, ...binds: unknown[]) => {
    if (/INSERT INTO coupon_user_usage/i.test(sql)) {
      const couponId = String(binds[0]);
      const userId = String(binds[1]);
      const limit = Number(binds[4]);
      const row = usage.get(key(couponId, userId));
      if (!row) {
        usage.set(key(couponId, userId), { coupon_id: couponId, user_id: userId, uses: 1 });
        return 1;
      }
      // The guarded upsert: `WHERE uses < ?` decides the winner.
      if (row.uses < limit) {
        row.uses += 1;
        return 1;
      }
      return 0;
    }
    if (/UPDATE coupons SET total_uses/i.test(sql)) {
      const id = String(binds[0]);
      const cap = Number(binds[1]);
      const current = totals.get(id) ?? 0;
      if (current >= cap) return 0;
      totals.set(id, current + 1);
      return 1;
    }
    return 0;
  },
}));

const { claimCouponUse } = await import("./coupon-usage.server");

describe("claiming a use", () => {
  beforeEach(() => {
    usage.clear();
    totals.clear();
  });

  it("lets each member claim once, independently", async () => {
    expect((await claimCouponUse({ couponId: "c", userId: "user_a", perUserLimit: 1 })).ok).toBe(
      true,
    );
    const again = await claimCouponUse({ couponId: "c", userId: "user_a", perUserLimit: 1 });
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("per_user_limit");

    // Member B is a different row, so member A's claim never touches it.
    expect((await claimCouponUse({ couponId: "c", userId: "user_b", perUserLimit: 1 })).ok).toBe(
      true,
    );
  });

  it("survives two simultaneous checkouts by the same member", async () => {
    const [first, second] = await Promise.all([
      claimCouponUse({ couponId: "c", userId: "user_a", perUserLimit: 1 }),
      claimCouponUse({ couponId: "c", userId: "user_a", perUserLimit: 1 }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(usage.get(key("c", "user_a"))?.uses).toBe(1);
  });

  it("never lets one member's use exhaust an uncapped coupon", async () => {
    for (const userId of ["a", "b", "c", "d", "e"]) {
      expect((await claimCouponUse({ couponId: "c", userId, perUserLimit: 1 })).ok).toBe(true);
    }
    expect(totals.get("c")).toBe(5);
  });
});
