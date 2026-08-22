import { describe, expect, it } from "vitest";

import { checkCoupon, couponDiscount, rowToCoupon } from "./coupons";

const ROW = {
  id: "cpn_1",
  code: "BANANA10",
  discount_type: "percentage",
  discount_value: 10,
  start_at: "2026-01-01T00:00:00.000Z",
  expiration_at: "2026-12-31T00:00:00.000Z",
  usage_limit: 100,
  per_user_limit: 1,
  eligible_products: "[]",
  eligible_categories: "[]",
  eligible_users: "[]",
  min_order_amount: 10000,
  max_discount_amount: 5000,
  is_active: 1,
  only_digital_products: 0,
  is_stackable: 0,
  once_per_user_lifetime: 0,
  created_at: "2026-01-01T00:00:00.000Z",
};

const base = {
  userId: "usr_1",
  orderAmount: 50000,
  items: [{ productId: "p1", kind: "account", unitPrice: 50000, quantity: 1 }],
  globalUses: 0,
  userUses: 0,
  lifetimeSingleItemUses: 0,
  now: new Date("2026-06-01T00:00:00.000Z"),
};

describe("rowToCoupon", () => {
  it("reads every column into the shape the rules are written against", () => {
    const coupon = rowToCoupon(ROW);
    expect(coupon).toMatchObject({
      id: "cpn_1",
      code: "BANANA10",
      discountType: "percentage",
      discountValue: 10,
      startAt: "2026-01-01T00:00:00.000Z",
      expirationAt: "2026-12-31T00:00:00.000Z",
      usageLimit: 100,
      perUserLimit: 1,
      minOrderAmount: 10000,
      maxDiscountAmount: 5000,
      isActive: true,
      onlyDigitalProducts: false,
      isStackable: false,
    });
  });

  it("treats single_item_percent as 50% discount by default", () => {
    const single = rowToCoupon({
      ...ROW,
      discount_type: "single_item_percent",
      discount_value: null,
    });
    expect(single.discountType).toBe("single_item_percent");
    expect(single.discountValue).toBe(50);
    expect(single.oncePerUserLifetime).toBe(true);
  });

  it("parses JSON eligibility lists and tolerates broken ones", () => {
    expect(rowToCoupon({ ...ROW, eligible_users: '["usr_a","usr_b"]' }).eligibleUsers).toEqual([
      "usr_a",
      "usr_b",
    ]);
    expect(rowToCoupon({ ...ROW, eligible_users: "not json" }).eligibleUsers).toEqual([]);
  });
});

describe("checkCoupon", () => {
  const coupon = rowToCoupon(ROW);

  it("passes a valid coupon", () => {
    expect(checkCoupon({ coupon, ...base })).toEqual({ ok: true });
  });

  it("refuses a coupon that has not started yet", () => {
    const future = rowToCoupon({ ...ROW, start_at: "2026-07-01T00:00:00.000Z" });
    expect(checkCoupon({ coupon: future, ...base })).toEqual({ ok: false, reason: "not_started" });
  });

  it("refuses an expired coupon", () => {
    const result = checkCoupon({ coupon, ...base, now: new Date("2027-01-01T00:00:00.000Z") });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses once the global usage limit is reached", () => {
    expect(checkCoupon({ coupon, ...base, globalUses: 100 })).toEqual({
      ok: false,
      reason: "usage_limit",
    });
  });

  it("refuses a member who already used it", () => {
    expect(checkCoupon({ coupon, ...base, userUses: 1 })).toEqual({
      ok: false,
      reason: "per_user_limit",
    });
  });

  it("allows User B to use a coupon even if User A already redeemed it when global limit is not reached", () => {
    const unlimitedGlobalCoupon = rowToCoupon({
      ...ROW,
      usage_limit: null,
      per_user_limit: 1,
    });
    // User A has already used it (userUses: 1) -> refused
    expect(
      checkCoupon({
        coupon: unlimitedGlobalCoupon,
        ...base,
        userId: "user_A",
        userUses: 1,
        globalUses: 15,
      }),
    ).toEqual({
      ok: false,
      reason: "per_user_limit",
    });

    // User B has NOT used it yet (userUses: 0) -> accepted
    expect(
      checkCoupon({
        coupon: unlimitedGlobalCoupon,
        ...base,
        userId: "user_B",
        userUses: 0,
        globalUses: 15,
      }),
    ).toEqual({
      ok: true,
    });
  });

  it("refuses single_item_percent if already used in user lifetime", () => {
    const singleCoupon = rowToCoupon({
      ...ROW,
      discount_type: "single_item_percent",
    });
    expect(
      checkCoupon({
        coupon: singleCoupon,
        ...base,
        lifetimeSingleItemUses: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "lifetime_single_item_used",
    });
  });

  it("refuses an order under the minimum", () => {
    expect(checkCoupon({ coupon, ...base, orderAmount: 9999 })).toEqual({
      ok: false,
      reason: "min_order",
    });
  });

  it("refuses a member outside the eligibility list", () => {
    const restricted = rowToCoupon({ ...ROW, eligible_users: '["usr_other"]' });
    expect(checkCoupon({ coupon: restricted, ...base })).toEqual({
      ok: false,
      reason: "not_eligible",
    });
    expect(checkCoupon({ coupon: restricted, ...base, userId: "usr_other" })).toEqual({ ok: true });
  });

  it("refuses a digital-only coupon on a basket with hardware", () => {
    const digital = rowToCoupon({ ...ROW, only_digital_products: 1 });
    expect(
      checkCoupon({ coupon: digital, ...base, items: [{ productId: "p1", kind: "hardware" }] }),
    ).toEqual({
      ok: false,
      reason: "digital_only",
    });
    expect(checkCoupon({ coupon: digital, ...base })).toEqual({ ok: true });
  });

  it("refuses an inactive coupon", () => {
    expect(checkCoupon({ coupon: rowToCoupon({ ...ROW, is_active: 0 }), ...base })).toEqual({
      ok: false,
      reason: "inactive",
    });
  });
});

describe("couponDiscount", () => {
  it("applies a percentage and respects the cap", () => {
    const coupon = rowToCoupon(ROW);
    expect(couponDiscount(coupon, 30000).discount).toBe(3000);
    // 10% of 90,000 is 9,000, capped at 5,000.
    expect(couponDiscount(coupon, 90000).discount).toBe(5000);
  });

  it("applies a fixed amount and never exceeds the order", () => {
    const fixed = rowToCoupon({
      ...ROW,
      discount_type: "fixed",
      discount_value: 8000,
      max_discount_amount: null,
    });
    expect(couponDiscount(fixed, 30000).discount).toBe(8000);
    expect(couponDiscount(fixed, 5000).discount).toBe(5000);
  });

  it("never returns a negative or fractional discount", () => {
    const odd = rowToCoupon({ ...ROW, discount_value: 33, max_discount_amount: null });
    expect(couponDiscount(odd, 1000).discount).toBe(330);
  });

  it("applies 50% discount strictly to ONE unit even when quantity = 3", () => {
    // User request example: Game 20,000 IQD x 3 = 60,000 IQD.
    // 50% discount on 1 unit = -10,000 IQD. Total = 50,000 IQD.
    const singleCoupon = rowToCoupon({
      id: "cpn_single_50",
      code: "GAME50",
      discount_type: "single_item_percent",
      discount_value: 50,
      is_active: 1,
    });

    const items = [
      {
        productId: "game_zelda",
        title: "Zelda Tears of the Kingdom",
        unitPrice: 20000,
        quantity: 3,
        kind: "account",
      },
    ];

    const result = couponDiscount(singleCoupon, 60000, items);
    expect(result.discount).toBe(10000);
    expect(result.targetProductId).toBe("game_zelda");
  });

  it("picks the highest price eligible game by default or respects targetProductId selection", () => {
    const singleCoupon = rowToCoupon({
      id: "cpn_single_50",
      code: "GAME50",
      discount_type: "single_item_percent",
      discount_value: 50,
      is_active: 1,
    });

    const items = [
      {
        productId: "game_mario",
        title: "Mario Odyssey",
        unitPrice: 20000,
        quantity: 2,
        kind: "account",
      },
      {
        productId: "game_elden",
        title: "Elden Ring",
        unitPrice: 45000,
        quantity: 1,
        kind: "account",
      },
    ];

    // Default should pick Elden Ring (45,000 / 2 = 22,500 IQD)
    const defaultResult = couponDiscount(singleCoupon, 85000, items);
    expect(defaultResult.discount).toBe(22500);
    expect(defaultResult.targetProductId).toBe("game_elden");

    // Explicitly targeting Mario should discount 1 unit of Mario (20,000 / 2 = 10,000 IQD)
    const targetResult = couponDiscount(singleCoupon, 85000, items, "game_mario");
    expect(targetResult.discount).toBe(10000);
    expect(targetResult.targetProductId).toBe("game_mario");
  });
});
