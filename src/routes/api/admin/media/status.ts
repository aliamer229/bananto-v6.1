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

          const externalProductsList: Array<{
            id: string;
            title: string;
            externalFields: string[];
          }> = [];

          for (const product of products) {
            const externalFields: string[] = [];

            for (const f of SINGLE_IMAGE_FIELDS) {
              const val = (product as any)[f];
              if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
                externalFields.push(f);
                totalExternalImages++;
              } else if (typeof val === "string" && val.startsWith("/api/files/")) {
                totalStoredImages++;
              }
            }

            for (const f of ARRAY_IMAGE_FIELDS) {
              const arr = (product as any)[f];
              if (Array.isArray(arr)) {
                for (const item of arr) {
                  if (typeof item === "string" && (item.startsWith("http://") || item.startsWith("https://"))) {
                    externalFields.push(f);
                    totalExternalImages++;
                  } else if (typeof item === "string" && item.startsWith("/api/files/")) {
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
              });
            }
          }

          // Query audit log summary from D1
          const failedAudits = await d1All<{ count: number }>(
            `SELECT COUNT(*) as count FROM game_images WHERE verified = 0`
          ).catch(() => [{ count: 0 }]);

          return json({
            success: true,
            totalProducts,
            productsWithExternalMedia,
            totalExternalImages,
            totalStoredImages,
            failedAuditRecords: failedAudits[0]?.count || 0,
            pendingProducts: externalProductsList.slice(0, 50),
          });
        }),
    },
  },
});
