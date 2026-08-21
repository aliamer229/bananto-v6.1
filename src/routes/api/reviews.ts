import { createFileRoute } from "@tanstack/react-router";

import { randomId } from "@/lib/crypto.server";
import { d1All, d1Run, ensureSchema, getD1 } from "@/lib/d1.server";
import { body, guard, json } from "@/lib/http.server";
import { getSessionUser, requireAdmin, requireUser } from "@/lib/session.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  comment: string;
  status: string;
  is_buyer?: number | boolean;
  created_at: string;
  user_name?: string | null;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const Route = createFileRoute("/api/reviews")({
  server: {
    handlers: {
      /**
       * `?productId=` → approved reviews for one product + user's own review if signed in.
       * `?scope=all`  → every review (admin moderation).
       * default       → the signed-in member's own reviews.
       */
      GET: async ({ request }) =>
        guard(async () => {
          if (!getD1()) return json({ reviews: [], summary: { count: 0, average: 0 } });
          await ensureSchema();
          const url = new URL(request.url);
          const productId = url.searchParams.get("productId");
          const scope = url.searchParams.get("scope");
          const user = await getSessionUser(request);

          let rows: ReviewRow[] = [];
          let myReview: ReviewRow | null = null;

          if (productId) {
            rows = await d1All<ReviewRow>(
              `SELECT r.*, u.name AS user_name FROM product_reviews r
               LEFT JOIN users u ON u.id = r.user_id
               WHERE r.product_id = ? AND r.status = 'approved'
               ORDER BY r.created_at DESC LIMIT 100`,
              productId,
            );

            if (user) {
              const myRows = await d1All<ReviewRow>(
                `SELECT r.*, u.name AS user_name FROM product_reviews r
                 LEFT JOIN users u ON u.id = r.user_id
                 WHERE r.product_id = ? AND r.user_id = ? LIMIT 1`,
                productId,
                user.id,
              );
              if (myRows.length > 0 && myRows[0]) {
                myReview = myRows[0];
              }
            }
          } else if (scope === "all") {
            await requireAdmin(request);
            rows = await d1All<ReviewRow>(
              `SELECT r.*, u.name AS user_name FROM product_reviews r
               LEFT JOIN users u ON u.id = r.user_id
               ORDER BY r.created_at DESC LIMIT 500`,
            );
          } else if (user) {
            rows = await d1All<ReviewRow>(
              `SELECT * FROM product_reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
              user.id,
            );
          }

          const count = rows.length;
          const average = count
            ? Math.round((rows.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count) * 10) /
              10
            : 0;

          const visibleRows = productId
            ? rows.map((row) => ({
                id: row.id,
                product_id: row.product_id,
                rating: row.rating,
                comment: row.comment,
                created_at: row.created_at,
                is_buyer: Boolean(row.is_buyer || row.order_id),
                user_name: row.user_name ?? null,
              }))
            : rows;

          return json({
            reviews: visibleRows,
            myReview: myReview
              ? {
                  id: myReview.id,
                  product_id: myReview.product_id,
                  rating: myReview.rating,
                  comment: myReview.comment,
                  status: myReview.status,
                  is_buyer: Boolean(myReview.is_buyer || myReview.order_id),
                  created_at: myReview.created_at,
                  user_name: myReview.user_name ?? null,
                }
              : null,
            summary: { count, average },
          });
        }),

      /** Member posts (or updates) a review for a product, defaulting to pending status. */
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const throttle = await consumeRateLimit(
            request,
            "review-submit",
            10,
            24 * 60 * 60,
            user.id,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
          if (!getD1()) return json({ error: "قاعدة البيانات غير متاحة" }, { status: 503 });
          await ensureSchema();
          const input = await body<Record<string, unknown>>(request);
          const productId = clean(input["productId"], 120);
          const rating = Math.max(1, Math.min(5, Math.round(Number(input["rating"]) || 0)));
          const comment = clean(input["comment"], 1200);
          if (!productId || !rating) {
            return json({ error: "المنتج والتقييم مطلوبان" }, { status: 400 });
          }

          // Check if user is a verified buyer of this product.
          // The order payload lives in the `doc` column; `orders.items` does not
          // exist, so this query used to raise "no such column" and turn every
          // review submission into a 500.
          const orderMatch = await d1All<{ id: string }>(
            `SELECT id FROM orders WHERE user_id = ? AND (doc LIKE ? OR doc LIKE ?) LIMIT 1`,
            user.id,
            `%"productId":"${productId}"%`,
            `%"productId":${productId}%`,
          );
          const isBuyer = orderMatch.length > 0 ? 1 : 0;
          const orderId = orderMatch[0]?.id || clean(input["orderId"], 80) || null;

          // Replace existing review to ensure 1 review per user
          await d1Run(
            `DELETE FROM product_reviews WHERE product_id = ? AND user_id = ?`,
            productId,
            user.id,
          );

          await d1Run(
            `INSERT INTO product_reviews (id, product_id, user_id, order_id, rating, comment, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
            randomId("rev"),
            productId,
            user.id,
            orderId,
            rating,
            comment,
            new Date().toISOString(),
          );
          return json({ ok: true, status: "pending", isBuyer: Boolean(isBuyer) });
        }),

      /** Admin moderation: approve / hide / delete. */
      PATCH: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          await ensureSchema();
          const input = await body<Record<string, unknown>>(request);
          const id = clean(input["id"], 80);
          const action = clean(input["action"], 20);
          if (!id) return json({ error: "معرّف غير صالح" }, { status: 400 });
          if (action === "delete") {
            await d1Run(`DELETE FROM product_reviews WHERE id = ?`, id);
          } else {
            await d1Run(
              `UPDATE product_reviews SET status = ? WHERE id = ?`,
              action === "hide" ? "hidden" : "approved",
              id,
            );
          }
          return json({ ok: true });
        }),
    },
  },
});
