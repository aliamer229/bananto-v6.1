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
  start_at?: unknown;
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
  is_stackable?: unknown;
  once_per_user_lifetime?: unknown;
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

export function getCouponRemainingTime(expirationAt?: string): {
  isExpired: boolean;
  remainingMs: number;
  remainingText: string;
} {
  if (!expirationAt) {
    return { isExpired: false, remainingMs: Infinity, remainingText: "صلاحية غير محدودة" };
  }
  const expTime = new Date(expirationAt).getTime();
  if (isNaN(expTime)) {
    return { isExpired: false, remainingMs: Infinity, remainingText: "صلاحية غير محدودة" };
  }
  const diffMs = expTime - Date.now();
  if (diffMs <= 0) {
    return { isExpired: true, remainingMs: 0, remainingText: "منتهي الصلاحية" };
  }
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return {
      isExpired: false,
      remainingMs: diffMs,
      remainingText: `متبقي ${days} يوم${hours > 0 ? ` و ${hours} ساعة` : ""}`,
    };
  }
  if (hours > 0) {
    return {
      isExpired: false,
      remainingMs: diffMs,
      remainingText: `متبقي ${hours} ساعة${minutes > 0 ? ` و ${minutes} دقيقة` : ""}`,
    };
  }
  return {
    isExpired: false,
    remainingMs: diffMs,
    remainingText: `متبقي ${Math.max(1, minutes)} دقيقة`,
  };
}

export function rowToCoupon(row: CouponRow | any): Coupon {
  const rawType = String(row.discount_type ?? row.discountType ?? "fixed").toLowerCase();
  let discountType: DiscountType = "fixed";
  if (rawType === "percentage") discountType = "percentage";
  else if (
    rawType === "single_item_percent" ||
    rawType === "single_item" ||
    rawType === "single_game_50"
  ) {
    discountType = "single_item_percent";
  }

  const startAt = row.start_at
    ? String(row.start_at)
    : row.startAt
      ? String(row.startAt)
      : undefined;
  const expiration = row.expiration_at
    ? String(row.expiration_at)
    : row.expires_at
      ? String(row.expires_at)
      : row.expirationAt
        ? String(row.expirationAt)
        : undefined;
  const usageLimit = optionalNumber(row.usage_limit ?? row.usageLimit);
  const maxDiscount = optionalNumber(row.max_discount_amount ?? row.maxDiscountAmount);
  const perUserLimit = optionalNumber(row.per_user_limit ?? row.perUserLimit) ?? 1;
  const oncePerUserLifetime =
    discountType === "single_item_percent" ||
    (row.once_per_user_lifetime !== undefined && row.once_per_user_lifetime !== null
      ? Boolean(Number(row.once_per_user_lifetime))
      : row.oncePerUserLifetime !== undefined
        ? Boolean(row.oncePerUserLifetime)
        : perUserLimit === 1);

  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    discountType,
    discountValue:
      optionalNumber(row.discount_value ?? row.discountValue) ??
      (discountType === "single_item_percent" ? 50 : 0),
    ...(startAt ? { startAt, start_at: startAt } : {}),
    ...(expiration
      ? { expirationAt: expiration, expiration_at: expiration, expires_at: expiration }
      : {}),
    ...(usageLimit !== undefined ? { usageLimit, usage_limit: usageLimit } : {}),
    perUserLimit,
    per_user_limit: perUserLimit,
    eligibleProducts: jsonList(row.eligible_products ?? row.eligibleProducts),
    eligibleCategories: jsonList(row.eligible_categories ?? row.eligibleCategories),
    eligibleUsers: jsonList(row.eligible_users ?? row.eligibleUsers),
    minOrderAmount: optionalNumber(row.min_order_amount ?? row.minOrderAmount) ?? 0,
    ...(maxDiscount !== undefined
      ? { maxDiscountAmount: maxDiscount, max_discount_amount: maxDiscount }
      : {}),
    isActive:
      row.is_active === undefined && row.isActive === undefined
        ? true
        : Boolean(Number(row.is_active ?? (row.isActive ? 1 : 0))),
    is_active:
      row.is_active === undefined && row.isActive === undefined
        ? 1
        : Number(Boolean(Number(row.is_active ?? (row.isActive ? 1 : 0)))),
    onlyDigitalProducts: Boolean(
      Number(row.only_digital_products ?? (row.onlyDigitalProducts ? 1 : 0)),
    ),
    only_digital_products: Number(
      Boolean(Number(row.only_digital_products ?? (row.onlyDigitalProducts ? 1 : 0))),
    ),
    isStackable: Boolean(Number(row.is_stackable ?? (row.isStackable ? 1 : 0))),
    is_stackable: Number(Boolean(Number(row.is_stackable ?? (row.isStackable ? 1 : 0)))),
    oncePerUserLifetime,
    once_per_user_lifetime: Number(oncePerUserLifetime),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    created_at: String(row.created_at ?? row.createdAt ?? ""),
  };
}

/** Item kinds a digital-only coupon must refuse. */
const PHYSICAL_KINDS = ["hardware", "physical", "accessory", "device", "collectible"];

export function isPhysicalKind(kind: string | undefined): boolean {
  return PHYSICAL_KINDS.includes(String(kind ?? "").toLowerCase());
}

export interface CouponCheckItem {
  productId: string | number;
  categoryId?: string | number;
  kind?: string;
  unitPrice?: number;
  quantity?: number;
  title?: string;
}

export interface CouponCheckInput {
  coupon: Coupon;
  userId: string;
  orderAmount: number;
  items: CouponCheckItem[];
  globalUses: number;
  userUses: number;
  lifetimeSingleItemUses?: number;
  targetProductId?: string | number;
  now?: Date;
}

export type CouponRefusal =
  | "inactive"
  | "not_started"
  | "expired"
  | "usage_limit"
  | "per_user_limit"
  | "lifetime_single_item_used"
  | "min_order"
  | "not_eligible"
  | "no_eligible_products"
  | "digital_only";

/**
 * Filter items in the cart that match the coupon eligibility constraints.
 */
export function getEligibleItems(coupon: Coupon, items: CouponCheckItem[]): CouponCheckItem[] {
  let list = items;
  if (coupon.onlyDigitalProducts) {
    list = list.filter((it) => !isPhysicalKind(it.kind));
  }
  if (coupon.eligibleProducts && coupon.eligibleProducts.length > 0) {
    const allowed = new Set(coupon.eligibleProducts.map(String));
    list = list.filter((it) => allowed.has(String(it.productId)));
  }
  if (coupon.eligibleCategories && coupon.eligibleCategories.length > 0) {
    const allowedCats = new Set(coupon.eligibleCategories.map(String));
    list = list.filter((it) => it.categoryId && allowedCats.has(String(it.categoryId)));
  }
  return list;
}

/**
 * The single set of rules a coupon has to pass, shared by the checkout path and
 * the "check this code" call so the two can never disagree about whether a
 * coupon applies.
 */
export function checkCoupon(
  input: CouponCheckInput,
): { ok: true; targetProduct?: CouponCheckItem } | { ok: false; reason: CouponRefusal } {
  const { coupon } = input;
  const now = input.now ?? new Date();

  if (!coupon.isActive) return { ok: false, reason: "inactive" };

  if (coupon.startAt && new Date(coupon.startAt).getTime() > now.getTime()) {
    return { ok: false, reason: "not_started" };
  }

  if (coupon.expirationAt && new Date(coupon.expirationAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  if (coupon.usageLimit !== undefined && input.globalUses >= coupon.usageLimit) {
    return { ok: false, reason: "usage_limit" };
  }

  // Lifetime single-item / once per user lifetime restriction
  if (coupon.discountType === "single_item_percent" || coupon.oncePerUserLifetime) {
    if ((input.lifetimeSingleItemUses ?? 0) > 0 || input.userUses >= 1) {
      return { ok: false, reason: "lifetime_single_item_used" };
    }
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

  // Check eligible products for single_item_percent or specific product restriction
  if (
    coupon.discountType === "single_item_percent" ||
    (coupon.eligibleProducts && coupon.eligibleProducts.length > 0)
  ) {
    const eligible = getEligibleItems(coupon, input.items);
    if (eligible.length === 0) {
      return { ok: false, reason: "no_eligible_products" };
    }

    // Determine target item: if user selected a specific productId, verify it's eligible
    let targetItem: CouponCheckItem | undefined;
    if (input.targetProductId) {
      targetItem = eligible.find((it) => String(it.productId) === String(input.targetProductId));
    }
    if (!targetItem) {
      // Default to highest priced eligible item
      targetItem = [...eligible].sort((a, b) => (b.unitPrice || 0) - (a.unitPrice || 0))[0];
    }

    return { ok: true, targetProduct: targetItem };
  }

  return { ok: true };
}

/**
 * The discount a passing coupon is worth, capped and never larger than the order.
 * For `single_item_percent`: applies strictly to 1 single unit of the chosen/highest-price eligible game.
 */
export function couponDiscount(
  coupon: Coupon,
  orderAmount: number,
  items: CouponCheckItem[] = [],
  targetProductId?: string | number,
): {
  discount: number;
  targetProductId?: string | number;
  targetTitle?: string;
  singleUnitPrice?: number;
} {
  if (coupon.discountType === "single_item_percent") {
    const eligible = getEligibleItems(coupon, items);
    if (eligible.length === 0) {
      return { discount: 0 };
    }

    let targetItem: CouponCheckItem | undefined;
    if (targetProductId) {
      targetItem = eligible.find((it) => String(it.productId) === String(targetProductId));
    }
    if (!targetItem) {
      // Sort by unit price descending so the user gets the best discount on 1 unit by default
      targetItem = [...eligible].sort((a, b) => (b.unitPrice || 0) - (a.unitPrice || 0))[0];
    }

    if (!targetItem) return { discount: 0 };

    const unitPrice = Math.max(0, targetItem.unitPrice || 0);
    const percent = coupon.discountValue > 0 ? coupon.discountValue : 50;

    // Strict 1-unit discount calculation:
    const baseDiscount = Math.floor(unitPrice * (percent / 100));
    const capped =
      coupon.maxDiscountAmount !== undefined
        ? Math.min(baseDiscount, coupon.maxDiscountAmount)
        : baseDiscount;

    const discount = Math.min(Math.max(0, Math.floor(capped)), Math.floor(orderAmount));
    return {
      discount,
      targetProductId: targetItem.productId,
      targetTitle: targetItem.title,
      singleUnitPrice: unitPrice,
    };
  }

  const base =
    coupon.discountType === "percentage"
      ? Math.floor(orderAmount * (coupon.discountValue / 100))
      : coupon.discountValue;
  const capped =
    coupon.maxDiscountAmount !== undefined ? Math.min(base, coupon.maxDiscountAmount) : base;

  if (!Number.isFinite(capped) || capped <= 0) return { discount: 0 };
  const discount = Math.min(Math.floor(capped), Math.floor(orderAmount));
  return { discount };
}

export const COUPON_REFUSAL_MESSAGE: Record<CouponRefusal, string> = {
  inactive: "الكوبون غير موجود أو غير فعال",
  not_started: "الكوبون غير متاح للاستخدام بعد",
  expired: "انتهت صلاحية الكوبون",
  usage_limit: "تم استنفاد عدد مرات استخدام الكوبون",
  per_user_limit: "لقد استخدمت هذا الكوبون مسبقاً",
  lifetime_single_item_used:
    "لقد استفدت مسبقاً من عرض الخصم 50% على لعبة واحدة (متاح مرة واحدة فقط لكل حساب)",
  min_order: "قيمة الطلب أقل من الحد الأدنى لاستخدام الكوبون",
  not_eligible: "هذا الكوبون غير مخصص لحسابك",
  no_eligible_products: "السلة لا تحتوي على أي لعبة مؤهلة لهذا الكوبون",
  digital_only: "هذا الكوبون صالح فقط للمنتجات الرقمية.",
};
