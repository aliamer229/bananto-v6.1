import { describe, expect, it } from "vitest";

import { checkCoupon, couponDiscount, rowToCoupon } from "./coupons";

/**
 * The validator used to read a snake_case database row as if it were the
 * camelCase `Coupon` type. Every limit came back `undefined`, so nothing was
 * enforced: expired coupons worked, usage caps did not exist, and a single code
 * could be redeemed by anyone any number of times. These tests are those rules.
 */

const ROW = {
  id: "cpn_1",
  code: "BANANA10",
  discount_type: "percentage",
  discount_value: 10,
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
  created_at: "2026-01-01T00:00:00.000Z",
};

const base = {
  userId: "usr_1",
  orderAmount: 50000,
  items: [{ kind: "account" }],
  globalUses: 0,
  userUses: 0,
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
      expirationAt: "2026-12-31T00:00:00.000Z",
      usageLimit: 100,
      perUserLimit: 1,
      minOrderAmount: 10000,
      maxDiscountAmount: 5000,
      isActive: true,
      onlyDigitalProducts: false,
    });
  });

  it("treats a missing per-member limit as one use, never unlimited", () => {
    expect(rowToCoupon({ ...ROW, per_user_limit: null }).perUserLimit).toBe(1);
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
    expect(checkCoupon({ coupon: digital, ...base, items: [{ kind: "hardware" }] })).toEqual({
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
    expect(couponDiscount(coupon, 30000)).toBe(3000);
    // 10% of 90,000 is 9,000, capped at 5,000.
    expect(couponDiscount(coupon, 90000)).toBe(5000);
  });

  it("applies a fixed amount and never exceeds the order", () => {
    const fixed = rowToCoupon({
      ...ROW,
      discount_type: "fixed",
      discount_value: 8000,
      max_discount_amount: null,
    });
    expect(couponDiscount(fixed, 30000)).toBe(8000);
    expect(couponDiscount(fixed, 5000)).toBe(5000);
  });

  it("never returns a negative or fractional discount", () => {
    const odd = rowToCoupon({ ...ROW, discount_value: 33, max_discount_amount: null });
    expect(couponDiscount(odd, 1000)).toBe(330);
    expect(couponDiscount(rowToCoupon({ ...ROW, discount_value: 0 }), 1000)).toBe(0);
  });
});
