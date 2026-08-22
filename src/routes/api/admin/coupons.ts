import { createFileRoute } from "@tanstack/react-router";
import { d1All, d1First, d1Execute } from "@/lib/d1.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { v4 as uuidv4 } from "uuid";

export const Route = createFileRoute("/api/admin/coupons")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const coupons = await d1All("SELECT * FROM coupons ORDER BY created_at DESC");
          return json({ coupons });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body(request);
          const id = uuidv4();
          const createdAt = new Date().toISOString();

          const code = String(data.code || "")
            .trim()
            .toUpperCase();
          if (!code) {
            return json({ error: "code_required" }, { status: 400 });
          }

          const discountType = String(data.discountType || data.discount_type || "percentage");
          const discountValue = Number(
            data.discountValue ||
              data.discount_value ||
              (discountType === "single_item_percent" ? 50 : 0),
          );
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
            data.startAt || data.start_at || null,
            data.expirationAt || data.expiration_at || null,
            data.usageLimit || data.usage_limit || null,
            data.perUserLimit || data.per_user_limit || 1,
            JSON.stringify(data.eligibleProducts || data.eligible_products || []),
            JSON.stringify(data.eligibleCategories || data.eligible_categories || []),
            JSON.stringify(data.eligibleUsers || data.eligible_users || []),
            data.minOrderAmount || data.min_order_amount || 0,
            data.maxDiscountAmount || data.max_discount_amount || null,
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
          const data = await body(request);

          const code = String(data.code || "")
            .trim()
            .toUpperCase();
          const discountType = String(data.discountType || data.discount_type || "percentage");
          const discountValue = Number(
            data.discountValue ||
              data.discount_value ||
              (discountType === "single_item_percent" ? 50 : 0),
          );
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
            data.startAt || data.start_at || null,
            data.expirationAt || data.expiration_at || null,
            data.usageLimit || data.usage_limit || null,
            data.perUserLimit || data.per_user_limit || 1,
            JSON.stringify(data.eligibleProducts || data.eligible_products || []),
            JSON.stringify(data.eligibleCategories || data.eligible_categories || []),
            JSON.stringify(data.eligibleUsers || data.eligible_users || []),
            data.minOrderAmount || data.min_order_amount || 0,
            data.maxDiscountAmount || data.max_discount_amount || null,
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
