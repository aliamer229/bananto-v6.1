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
          
          await d1Execute(
            `INSERT INTO coupons (
              id, code, discount_type, discount_value, expiration_at, 
              usage_limit, per_user_limit, eligible_products, 
              eligible_categories, eligible_users, min_order_amount, 
              max_discount_amount, is_active, only_digital_products, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            data.code,
            data.discountType || data.discount_type,
            data.discountValue || data.discount_value,
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
            createdAt
          );

          return json({ success: true, id });
        }),
      PUT: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body(request);
          
          await d1Execute(
            `UPDATE coupons SET 
              code = ?, discount_type = ?, discount_value = ?, expiration_at = ?, 
              usage_limit = ?, per_user_limit = ?, eligible_products = ?, 
              eligible_categories = ?, eligible_users = ?, min_order_amount = ?, 
              max_discount_amount = ?, is_active = ?, only_digital_products = ?
            WHERE id = ?`,
            data.code,
            data.discountType || data.discount_type,
            data.discountValue || data.discount_value,
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
            data.id
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
