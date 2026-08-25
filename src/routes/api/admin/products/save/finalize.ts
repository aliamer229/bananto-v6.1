import { createFileRoute } from "@tanstack/react-router";
import { guard, body, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1All, d1Run } from "@/lib/d1.server";
import { invalidateStoreCache } from "@/lib/db.server";
import { sanitizeAndVerifyProductImages } from "@/lib/productImageVerification.server";

export const Route = createFileRoute("/api/admin/products/save/finalize")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<{ save_session_id: string }>(request);
          
          if (!payload.save_session_id) {
            return json({ error: "Missing save_session_id" }, { status: 400 });
          }

          const sessionId = payload.save_session_id;

          // Retrieve all chunks
          const rows = await d1All<{ key: string; value: string }>(
            `SELECT key, value FROM store_kv WHERE key LIKE ?`,
            `staged_save:${sessionId}:%`
          );

          if (rows.length === 0) {
            return json({ error: "No data found for session" }, { status: 404 });
          }

          const productParts: Record<string, any> = {};
          for (const row of rows) {
            const partMatch = row.key.match(/^staged_save:[^:]+:(.+)$/);
            if (!partMatch || partMatch[1] === "meta") continue;
            try {
              const partData = JSON.parse(row.value);
              Object.assign(productParts, partData);
            } catch (err) {
              console.error("Failed to parse chunk data:", err);
            }
          }

          if (!productParts.id) {
            return json({ error: "Product ID is missing from chunks" }, { status: 400 });
          }

          const productId = productParts.id;

          // Sanitize and verify all product images (ensure WebP in R2, no lingering blob URLs)
          const imgVerification = await sanitizeAndVerifyProductImages(productParts);
          if (!imgVerification.ok) {
            return json({ error: imgVerification.error || "Image verification failed" }, { status: 400 });
          }
          const productToSave = imgVerification.product;

          // Save directly as granular product
          await d1Run(
            `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            `store:product:${productId}`,
            JSON.stringify(productToSave),
            new Date().toISOString(),
          );

          // Clean up staged chunks
          await d1Run(`DELETE FROM store_kv WHERE key LIKE ?`, `staged_save:${sessionId}:%`);
          
          invalidateStoreCache();
          
          // Read-after-write verification
          const verifyRows = await d1All<{ key: string; value: string }>(
            `SELECT key, value FROM store_kv WHERE key = ?`,
            `store:product:${productId}`
          );
          
          if (verifyRows.length === 0) {
            return json({ error: "Failed to verify product save (Read-after-write failed)" }, { status: 500 });
          }

          return json({ success: true, product: JSON.parse(verifyRows[0]?.value || "{}") });
        }),
    },
  },
});


