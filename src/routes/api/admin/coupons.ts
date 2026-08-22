import { createFileRoute } from "@tanstack/react-router";
import { d1All, d1First, d1Execute, d1Ready } from "@/lib/d1.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { rowToCoupon } from "@/lib/coupons";
import { v4 as uuidv4 } from "uuid";

export const Route = createFileRoute("/api/admin/coupons")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await d1Ready();
          const rows = await d1All<any>("SELECT * FROM coupons ORDER BY created_at DESC");
          const coupons = rows.map((r) => rowToCoupon(r));
          return json({ coupons });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await d1Ready();
          const data = await body(request);
          const id = uuidv4();
          const createdAt = new Date().toISOString();

          const code = String(data.code || "")
            .trim()
            .toUpperCase();
          if (!code) {
            return json({ error: "كود الكوبون مطلوب" }, { status: 400 });
          }

          // Check if code exists
          const existing = await d1First<{ id: string }>(
            "SELECT id FROM coupons WHERE UPPER(code) = ?",
            code,
          );
          if (existing) {
            return json(
              { error: `كود الكوبون "${code}" مستخدم مسبقاً، يرجى اختيار كود آخر` },
              { status: 400 },
            );
          }

          const discountType = String(data.discountType || data.discount_type || "percentage");
          const discountValue = Number(
            data.discountValue !== undefined
              ? data.discountValue
              : data.discount_value !== undefined
                ? data.discount_value
                : discountType === "single_item_percent"
                  ? 50
                  : 0,
          );
          const expirationAt =
            data.expirationAt || data.expiration_at || data.expiresAt || data.expires_at || null;
          const startAt = data.startAt || data.start_at || null;

          const oncePerUserLifetime =
            data.oncePerUserLifetime !== undefined
              ? data.oncePerUserLifetime
                ? 1
                : 0
              : data.once_per_user_lifetime !== undefined
                ? Number(data.once_per_user_lifetime)
                : discountType === "single_item_percent"
                  ? 1
                  : 0;

          await d1Execute(
            `INSERT INTO coupons (
              id, code, discount_type, discount_value, start_at, expiration_at, 
              usage_limit, per_user_limit, eligible_products, 
              eligible_categories, eligible_users, min_order_amount, 
              max_discount_amount, is_active, only_digital_products,
              is_stackable, once_per_user_lifetime, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            code,
            discountType,
            discountValue,
            startAt,
            expirationAt,
            data.usageLimit !== undefined ? data.usageLimit : data.usage_limit || null,
            data.perUserLimit !== undefined ? data.perUserLimit : data.per_user_limit || 1,
            JSON.stringify(data.eligibleProducts || data.eligible_products || []),
            JSON.stringify(data.eligibleCategories || data.eligible_categories || []),
            JSON.stringify(data.eligibleUsers || data.eligible_users || []),
            data.minOrderAmount !== undefined ? data.minOrderAmount : data.min_order_amount || 0,
            data.maxDiscountAmount !== undefined
              ? data.maxDiscountAmount
              : data.max_discount_amount || null,
            data.isActive === false || data.is_active === 0 ? 0 : 1,
            data.onlyDigitalProducts || data.only_digital_products ? 1 : 0,
            data.isStackable || data.is_stackable ? 1 : 0,
            oncePerUserLifetime,
            createdAt,
          );

          return json({ success: true, id });
        }),
      PUT: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await d1Ready();
          const data = await body(request);

          const code = String(data.code || "")
            .trim()
            .toUpperCase();
          if (!code) {
            return json({ error: "كود الكوبون مطلوب" }, { status: 400 });
          }

          if (!data.id) {
            return json({ error: "معرف الكوبون مفقود" }, { status: 400 });
          }

          // Check if code is already used by another coupon
          const duplicate = await d1First<{ id: string }>(
            "SELECT id FROM coupons WHERE UPPER(code) = ? AND id != ?",
            code,
            data.id,
          );
          if (duplicate) {
            return json({ error: `كود الكوبون "${code}" مستخدم في كوبون آخر` }, { status: 400 });
          }

          const discountType = String(data.discountType || data.discount_type || "percentage");
          const discountValue = Number(
            data.discountValue !== undefined
              ? data.discountValue
              : data.discount_value !== undefined
                ? data.discount_value
                : discountType === "single_item_percent"
                  ? 50
                  : 0,
          );
          const expirationAt =
            data.expirationAt || data.expiration_at || data.expiresAt || data.expires_at || null;
          const startAt = data.startAt || data.start_at || null;

          const oncePerUserLifetime =
            data.oncePerUserLifetime !== undefined
              ? data.oncePerUserLifetime
                ? 1
                : 0
              : data.once_per_user_lifetime !== undefined
                ? Number(data.once_per_user_lifetime)
                : discountType === "single_item_percent"
                  ? 1
                  : 0;

          await d1Execute(
            `UPDATE coupons SET 
              code = ?, discount_type = ?, discount_value = ?, start_at = ?, expiration_at = ?, 
              usage_limit = ?, per_user_limit = ?, eligible_products = ?, 
              eligible_categories = ?, eligible_users = ?, min_order_amount = ?, 
              max_discount_amount = ?, is_active = ?, only_digital_products = ?,
              is_stackable = ?, once_per_user_lifetime = ?
            WHERE id = ?`,
            code,
            discountType,
            discountValue,
            startAt,
            expirationAt,
            data.usageLimit !== undefined ? data.usageLimit : data.usage_limit || null,
            data.perUserLimit !== undefined ? data.perUserLimit : data.per_user_limit || 1,
            JSON.stringify(data.eligibleProducts || data.eligible_products || []),
            JSON.stringify(data.eligibleCategories || data.eligible_categories || []),
            JSON.stringify(data.eligibleUsers || data.eligible_users || []),
            data.minOrderAmount !== undefined ? data.minOrderAmount : data.min_order_amount || 0,
            data.maxDiscountAmount !== undefined
              ? data.maxDiscountAmount
              : data.max_discount_amount || null,
            data.isActive === false || data.is_active === 0 ? 0 : 1,
            data.onlyDigitalProducts || data.only_digital_products ? 1 : 0,
            data.isStackable || data.is_stackable ? 1 : 0,
            oncePerUserLifetime,
            data.id,
          );

          return json({ success: true });
        }),
      DELETE: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await d1Ready();
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (id) {
            await d1Execute("DELETE FROM coupons WHERE id = ?", id);
          }
          return json({ success: true });
        }),
    },
  },
});
