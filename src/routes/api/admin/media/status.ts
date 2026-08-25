import { createFileRoute } from "@tanstack/react-router";
import { json, guard } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getStore } from "@/lib/db.server";
import { SINGLE_IMAGE_FIELDS, ARRAY_IMAGE_FIELDS } from "@/lib/productImageVerification.server";
import { d1All } from "@/lib/d1.server";

export const Route = createFileRoute("/api/admin/media/status")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const store = await getStore();
          const products = store.products || [];

          const totalProducts = products.length;
          let productsWithExternalMedia = 0;
          let totalExternalImages = 0;
          let totalStoredImages = 0;
          const hostBreakdown: Record<string, number> = {};

          const externalProductsList: Array<{
            id: string;
            title: string;
            externalFields: string[];
            sources: string[];
          }> = [];

          for (const product of products) {
            const externalFields: string[] = [];
            const sources: string[] = [];

            for (const f of SINGLE_IMAGE_FIELDS) {
              const val = (product as any)[f];
              if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
                externalFields.push(f);
                totalExternalImages++;
                try {
                  const h = new URL(val).hostname;
                  hostBreakdown[h] = (hostBreakdown[h] || 0) + 1;
                  sources.push(h);
                } catch {
                  // ignore
                }
              } else if (typeof val === "string" && val.startsWith("/api/files/")) {
                totalStoredImages++;
              }
            }

            for (const f of ARRAY_IMAGE_FIELDS) {
              const arr = (product as any)[f];
              if (Array.isArray(arr)) {
                for (const item of arr) {
                  const url = typeof item === "string" ? item : item?.imageUrl;
                  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
                    externalFields.push(f);
                    totalExternalImages++;
                    try {
                      const h = new URL(url).hostname;
                      hostBreakdown[h] = (hostBreakdown[h] || 0) + 1;
                      sources.push(h);
                    } catch {
                      // ignore
                    }
                  } else if (typeof url === "string" && url.startsWith("/api/files/")) {
                    totalStoredImages++;
                  }
                }
              }
            }

            if (externalFields.length > 0) {
              productsWithExternalMedia++;
              externalProductsList.push({
                id: String(product.id),
                title: String(product.titleEn || product.title || product.id),
                externalFields: Array.from(new Set(externalFields)),
                sources: Array.from(new Set(sources)),
              });
            }
          }

          // Query failed audits from D1
          const failedAudits = await d1All<{
            id: string;
            game_id: string;
            source_name: string;
            source_url: string;
            evidence: string;
            created_at: string;
          }>(
            `SELECT id, game_id, source_name, source_url, evidence, created_at
             FROM game_images
             WHERE verified = 0
             ORDER BY created_at DESC
             LIMIT 50`
          ).catch(() => []);

          return json({
            success: true,
            totalProducts,
            productsWithExternalMedia,
            totalExternalImages,
            totalStoredImages,
            hostBreakdown,
            failedAuditRecords: failedAudits.length,
            failedAudits,
            pendingProducts: externalProductsList.slice(0, 50),
          });
        }),
    },
  },
});
