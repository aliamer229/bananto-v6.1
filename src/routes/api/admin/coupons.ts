import { createFileRoute } from "@tanstack/react-router";
import { d1All, d1First, d1Execute, d1Ready, ensureCouponsSchema } from "@/lib/d1.server";
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
          await ensureCouponsSchema();
          const rows = await d1All<any>("SELECT * FROM coupons ORDER BY created_at DESC");
          const coupons = rows.map((r) => rowToCoupon(r));
          return json({ coupons });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await ensureCouponsSchema();
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

          const rawType = String(
            data.discountType || data.discount_type || "percentage",
          ).toLowerCase();
          const discountType =
            rawType === "single_item_percent" ||
            rawType === "single_item" ||
            rawType === "single_game_50"
              ? "single_item_percent"
              : rawType === "fixed"
                ? "fixed"
                : "percentage";

          const discountValue = Number.isFinite(Number(data.discountValue ?? data.discount_value))
            ? Number(data.discountValue ?? data.discount_value)
            : discountType === "single_item_percent"
              ? 50
              : 0;

          const rawExp =
            data.expirationAt ?? data.expiration_at ?? data.expiresAt ?? data.expires_at;
          const expirationAt = typeof rawExp === "string" && rawExp.trim() ? rawExp.trim() : null;

          const rawStart = data.startAt ?? data.start_at;
          const startAt = typeof rawStart === "string" && rawStart.trim() ? rawStart.trim() : null;

          const rawUsageLimit = data.usageLimit ?? data.usage_limit;
          const usageLimit =
            rawUsageLimit !== undefined &&
            rawUsageLimit !== null &&
            rawUsageLimit !== "" &&
            Number(rawUsageLimit) > 0
              ? Number(rawUsageLimit)
              : null;

          const rawPerUser = data.perUserLimit ?? data.per_user_limit;
          const perUserLimit =
            rawPerUser !== undefined &&
            rawPerUser !== null &&
            rawPerUser !== "" &&
            Number(rawPerUser) > 0
              ? Number(rawPerUser)
              : 1;

          const rawMaxDisc = data.maxDiscountAmount ?? data.max_discount_amount;
          const maxDiscountAmount =
            rawMaxDisc !== undefined &&
            rawMaxDisc !== null &&
            rawMaxDisc !== "" &&
            Number(rawMaxDisc) > 0
              ? Number(rawMaxDisc)
              : null;

          const rawMinOrder = data.minOrderAmount ?? data.min_order_amount;
          const minOrderAmount =
            rawMinOrder !== undefined &&
            rawMinOrder !== null &&
            rawMinOrder !== "" &&
            Number(rawMinOrder) > 0
              ? Number(rawMinOrder)
              : 0;

          const oncePerUserLifetime =
            discountType === "single_item_percent" ||
            Boolean(data.oncePerUserLifetime ?? data.once_per_user_lifetime)
              ? 1
              : 0;

          const eligibleProducts = Array.isArray(data.eligibleProducts ?? data.eligible_products)
            ? (data.eligibleProducts ?? data.eligible_products)
            : [];

          const eligibleCategories = Array.isArray(
            data.eligibleCategories ?? data.eligible_categories,
          )
            ? (data.eligibleCategories ?? data.eligible_categories)
            : [];

          const eligibleUsers = Array.isArray(data.eligibleUsers ?? data.eligible_users)
            ? (data.eligibleUsers ?? data.eligible_users)
            : [];

          const isActive = data.isActive === false || data.is_active === 0 ? 0 : 1;
          const onlyDigitalProducts =
            data.onlyDigitalProducts || data.only_digital_products ? 1 : 0;
          const isStackable = data.isStackable || data.is_stackable ? 1 : 0;

          const insertSql = `INSERT INTO coupons (
            id, code, discount_type, discount_value, start_at, expiration_at, 
            usage_limit, per_user_limit, eligible_products, 
            eligible_categories, eligible_users, min_order_amount, 
            max_discount_amount, is_active, only_digital_products,
            is_stackable, once_per_user_lifetime, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          try {
            await d1Execute(
              insertSql,
              id,
              code,
              discountType,
              discountValue,
              startAt,
              expirationAt,
              usageLimit,
              perUserLimit,
              JSON.stringify(eligibleProducts),
              JSON.stringify(eligibleCategories),
              JSON.stringify(eligibleUsers),
              minOrderAmount,
              maxDiscountAmount,
              isActive,
              onlyDigitalProducts,
              isStackable,
              oncePerUserLifetime,
              createdAt,
            );
          } catch (err: any) {
            console.error("[coupons:insert_failed]", {
              error: err.message,
              stack: err.stack,
              code,
              discountType,
            });
            return json(
              {
                error: `فشل حفظ الكوبون: ${err?.message || "خطأ في قاعدة البيانات"}`,
                sqlError: err?.message,
              },
              { status: 500 },
            );
          }

          const insertedRow = await d1First("SELECT * FROM coupons WHERE id = ?", id);
          return json({
            success: true,
            id,
            coupon: insertedRow ? rowToCoupon(insertedRow) : undefined,
          });
        }),
      PUT: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await ensureCouponsSchema();
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

          const rawType = String(
            data.discountType || data.discount_type || "percentage",
          ).toLowerCase();
          const discountType =
            rawType === "single_item_percent" ||
            rawType === "single_item" ||
            rawType === "single_game_50"
              ? "single_item_percent"
              : rawType === "fixed"
                ? "fixed"
                : "percentage";

          const discountValue = Number.isFinite(Number(data.discountValue ?? data.discount_value))
            ? Number(data.discountValue ?? data.discount_value)
            : discountType === "single_item_percent"
              ? 50
              : 0;

          const rawExp =
            data.expirationAt ?? data.expiration_at ?? data.expiresAt ?? data.expires_at;
          const expirationAt = typeof rawExp === "string" && rawExp.trim() ? rawExp.trim() : null;

          const rawStart = data.startAt ?? data.start_at;
          const startAt = typeof rawStart === "string" && rawStart.trim() ? rawStart.trim() : null;

          const rawUsageLimit = data.usageLimit ?? data.usage_limit;
          const usageLimit =
            rawUsageLimit !== undefined &&
            rawUsageLimit !== null &&
            rawUsageLimit !== "" &&
            Number(rawUsageLimit) > 0
              ? Number(rawUsageLimit)
              : null;

          const rawPerUser = data.perUserLimit ?? data.per_user_limit;
          const perUserLimit =
            rawPerUser !== undefined &&
            rawPerUser !== null &&
            rawPerUser !== "" &&
            Number(rawPerUser) > 0
              ? Number(rawPerUser)
              : 1;

          const rawMaxDisc = data.maxDiscountAmount ?? data.max_discount_amount;
          const maxDiscountAmount =
            rawMaxDisc !== undefined &&
            rawMaxDisc !== null &&
            rawMaxDisc !== "" &&
            Number(rawMaxDisc) > 0
              ? Number(rawMaxDisc)
              : null;

          const rawMinOrder = data.minOrderAmount ?? data.min_order_amount;
          const minOrderAmount =
            rawMinOrder !== undefined &&
            rawMinOrder !== null &&
            rawMinOrder !== "" &&
            Number(rawMinOrder) > 0
              ? Number(rawMinOrder)
              : 0;

          const oncePerUserLifetime =
            discountType === "single_item_percent" ||
            Boolean(data.oncePerUserLifetime ?? data.once_per_user_lifetime)
              ? 1
              : 0;

          const eligibleProducts = Array.isArray(data.eligibleProducts ?? data.eligible_products)
            ? (data.eligibleProducts ?? data.eligible_products)
            : [];

          const eligibleCategories = Array.isArray(
            data.eligibleCategories ?? data.eligible_categories,
          )
            ? (data.eligibleCategories ?? data.eligible_categories)
            : [];

          const eligibleUsers = Array.isArray(data.eligibleUsers ?? data.eligible_users)
            ? (data.eligibleUsers ?? data.eligible_users)
            : [];

          const isActive = data.isActive === false || data.is_active === 0 ? 0 : 1;
          const onlyDigitalProducts =
            data.onlyDigitalProducts || data.only_digital_products ? 1 : 0;
          const isStackable = data.isStackable || data.is_stackable ? 1 : 0;

          const updateSql = `UPDATE coupons SET 
            code = ?, discount_type = ?, discount_value = ?, start_at = ?, expiration_at = ?, 
            usage_limit = ?, per_user_limit = ?, eligible_products = ?, 
            eligible_categories = ?, eligible_users = ?, min_order_amount = ?, 
            max_discount_amount = ?, is_active = ?, only_digital_products = ?,
            is_stackable = ?, once_per_user_lifetime = ?
          WHERE id = ?`;

          try {
            await d1Execute(
              updateSql,
              code,
              discountType,
              discountValue,
              startAt,
              expirationAt,
              usageLimit,
              perUserLimit,
              JSON.stringify(eligibleProducts),
              JSON.stringify(eligibleCategories),
              JSON.stringify(eligibleUsers),
              minOrderAmount,
              maxDiscountAmount,
              isActive,
              onlyDigitalProducts,
              isStackable,
              oncePerUserLifetime,
              data.id,
            );
          } catch (err: any) {
            console.error("[coupons:update_failed]", {
              error: err.message,
              stack: err.stack,
              id: data.id,
              code,
            });
            return json(
              {
                error: `فشل تعديل الكوبون: ${err?.message || "خطأ في قاعدة البيانات"}`,
                sqlError: err?.message,
              },
              { status: 500 },
            );
          }

          const updatedRow = await d1First("SELECT * FROM coupons WHERE id = ?", data.id);
          return json({ success: true, coupon: updatedRow ? rowToCoupon(updatedRow) : undefined });
        }),
      DELETE: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await ensureCouponsSchema();
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
