import { createFileRoute } from "@tanstack/react-router";
import { json, guard, body } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getStore, invalidateStoreCache, updateStore } from "@/lib/db.server";
import { d1Run } from "@/lib/d1.server";
import { sanitizeAndVerifyProductImages, SINGLE_IMAGE_FIELDS, ARRAY_IMAGE_FIELDS } from "@/lib/productImageVerification.server";
import type { Product } from "@/lib/types";

export const Route = createFileRoute("/api/admin/media/repair")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const reqBody = await body<{
            productId?: string;
            batchSize?: number;
          }>(request).catch(() => ({ batchSize: 10, productId: undefined }));

          const store = await getStore();
          const allProducts = store.products || [];
          const batchSize = Math.max(1, Math.min(Number(reqBody.batchSize) || 10, 50));

          let targets: Product[] = [];

          if (reqBody.productId) {
            const found = allProducts.find((p) => String(p.id) === String(reqBody.productId));
            if (!found) {
              return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
            }
            targets = [found];
          } else {
            // Find products that have any external HTTP/HTTPS images
            targets = allProducts.filter((product) => {
              for (const f of SINGLE_IMAGE_FIELDS) {
                const val = (product as any)[f];
                if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
                  return true;
                }
              }
              for (const f of ARRAY_IMAGE_FIELDS) {
                const arr = (product as any)[f];
                if (Array.isArray(arr)) {
                  for (const item of arr) {
                    if (typeof item === "string" && (item.startsWith("http://") || item.startsWith("https://"))) {
                      return true;
                    }
                  }
                }
              }
              return false;
            }).slice(0, batchSize);
          }

          if (targets.length === 0) {
            return json({
              success: true,
              message: "لا توجد منتجات بحاجة إلى إصلاح وسائط خارجية حالياً.",
              processed: 0,
              repaired: 0,
              remaining: 0,
            });
          }

          let repairedCount = 0;
          const repairLog: Array<{
            productId: string;
            title: string;
            successCount: number;
            failedCount: number;
          }> = [];

          for (const target of targets) {
            const verification = await sanitizeAndVerifyProductImages(target);
            const updatedProduct = verification.product as Product;

            const successfulIngests = (verification.results || []).filter((r) => r.ok && r.status === "stored").length;
            const failedIngests = (verification.results || []).filter((r) => !r.ok || r.status === "failed").length;

            // Save updated product to store_kv
            await d1Run(
              `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              `store:product:${updatedProduct.id}`,
              JSON.stringify(updatedProduct),
              new Date().toISOString()
            );

            // Also update in-memory store
            await updateStore((s) => {
              const list = s.products || [];
              const idx = list.findIndex((p) => String(p.id) === String(updatedProduct.id));
              if (idx >= 0) {
                const next = [...list];
                next[idx] = updatedProduct;
                return { ...s, products: next };
              }
              return s;
            });

            if (successfulIngests > 0) repairedCount++;

            repairLog.push({
              productId: String(updatedProduct.id),
              title: String(updatedProduct.titleEn || updatedProduct.title || updatedProduct.id),
              successCount: successfulIngests,
              failedCount: failedIngests,
            });
          }

          invalidateStoreCache();

          // Count remaining products with external media
          const updatedStore = await getStore();
          const remainingCount = (updatedStore.products || []).filter((p) => {
            for (const f of SINGLE_IMAGE_FIELDS) {
              const val = (p as any)[f];
              if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) return true;
            }
            return false;
          }).length;

          return json({
            success: true,
            processed: targets.length,
            repaired: repairedCount,
            remaining: remainingCount,
            details: repairLog,
          });
        }),
    },
  },
});
