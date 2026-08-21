import type { Coupon, DiscountType } from "./types";

/**
 * Coupons live in D1 as snake_case columns and are used everywhere else as the
 * camelCase `Coupon` shape. Casting the raw row to `Coupon` — which is what the
 * validator did — type-checks against nothing and reads `undefined` at runtime,
 * so every limit on the coupon silently disappeared: no expiry, no usage cap,
 * no per-member cap, no minimum order. One mapper, used by every reader, is
 * what keeps those rules real.
 */
export interface CouponRow {
  id?: unknown;
  code?: unknown;
  discount_type?: unknown;
  discount_value?: unknown;
  expiration_at?: unknown;
  usage_limit?: unknown;
  per_user_limit?: unknown;
  eligible_products?: unknown;
  eligible_categories?: unknown;
  eligible_users?: unknown;
  min_order_amount?: unknown;
  max_discount_amount?: unknown;
  is_active?: unknown;
  only_digital_products?: unknown;
  created_at?: unknown;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jsonList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

export function rowToCoupon(row: CouponRow): Coupon {
  const discountType = String(row.discount_type ?? "fixed") as DiscountType;
  const expiration = row.expiration_at ? String(row.expiration_at) : undefined;
  const usageLimit = optionalNumber(row.usage_limit);
  const maxDiscount = optionalNumber(row.max_discount_amount);

  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    discountType,
    discountValue: optionalNumber(row.discount_value) ?? 0,
    ...(expiration ? { expirationAt: expiration } : {}),
    ...(usageLimit !== undefined ? { usageLimit } : {}),
    // A missing per-member limit means one use, never unlimited.
    perUserLimit: optionalNumber(row.per_user_limit) ?? 1,
    eligibleProducts: jsonList(row.eligible_products),
    eligibleCategories: jsonList(row.eligible_categories),
    eligibleUsers: jsonList(row.eligible_users),
    minOrderAmount: optionalNumber(row.min_order_amount) ?? 0,
    ...(maxDiscount !== undefined ? { maxDiscountAmount: maxDiscount } : {}),
    isActive: row.is_active === undefined ? true : Boolean(Number(row.is_active)),
    onlyDigitalProducts: Boolean(Number(row.only_digital_products ?? 0)),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Item kinds a digital-only coupon must refuse. */
const PHYSICAL_KINDS = ["hardware", "physical", "accessory", "device", "collectible"];

export function isPhysicalKind(kind: string | undefined): boolean {
  return PHYSICAL_KINDS.includes(String(kind ?? "").toLowerCase());
}

export interface CouponCheckInput {
  coupon: Coupon;
  userId: string;
  orderAmount: number;
  items: { kind?: string }[];
  globalUses: number;
  userUses: number;
  now?: Date;
}

export type CouponRefusal =
  | "inactive"
  | "expired"
  | "usage_limit"
  | "per_user_limit"
  | "min_order"
  | "not_eligible"
  | "digital_only";

/**
 * The single set of rules a coupon has to pass, shared by the checkout path and
 * the "check this code" call so the two can never disagree about whether a
 * coupon applies.
 */
export function checkCoupon(
  input: CouponCheckInput,
): { ok: true } | { ok: false; reason: CouponRefusal } {
  const { coupon } = input;
  const now = input.now ?? new Date();

  if (!coupon.isActive) return { ok: false, reason: "inactive" };
  if (coupon.expirationAt && new Date(coupon.expirationAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (coupon.usageLimit !== undefined && input.globalUses >= coupon.usageLimit) {
    return { ok: false, reason: "usage_limit" };
  }
  if (input.userUses >= coupon.perUserLimit) {
    return { ok: false, reason: "per_user_limit" };
  }
  if (input.orderAmount < coupon.minOrderAmount) {
    return { ok: false, reason: "min_order" };
  }
  if (coupon.eligibleUsers.length > 0 && !coupon.eligibleUsers.includes(input.userId)) {
    return { ok: false, reason: "not_eligible" };
  }
  if (coupon.onlyDigitalProducts && input.items.some((item) => isPhysicalKind(item.kind))) {
    return { ok: false, reason: "digital_only" };
  }
  return { ok: true };
}

/** The discount a passing coupon is worth, capped and never larger than the order. */
export function couponDiscount(coupon: Coupon, orderAmount: number): number {
  const base =
    coupon.discountType === "percentage"
      ? Math.floor(orderAmount * (coupon.discountValue / 100))
      : coupon.discountValue;
  const capped =
    coupon.maxDiscountAmount !== undefined ? Math.min(base, coupon.maxDiscountAmount) : base;
  if (!Number.isFinite(capped) || capped <= 0) return 0;
  return Math.min(Math.floor(capped), Math.floor(orderAmount));
}

export const COUPON_REFUSAL_MESSAGE: Record<CouponRefusal, string> = {
  inactive: "الكوبون غير موجود أو غير فعال",
  expired: "انتهت صلاحية الكوبون",
  usage_limit: "تم استنفاد عدد مرات استخدام الكوبون",
  per_user_limit: "لقد استخدمت هذا الكوبون مسبقاً",
  min_order: "قيمة الطلب أقل من الحد الأدنى لاستخدام الكوبون",
  not_eligible: "هذا الكوبون غير مخصص لحسابك",
  digital_only: "هذا الكوبون صالح فقط للمنتجات الرقمية.",
};
