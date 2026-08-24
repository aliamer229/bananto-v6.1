import { createFileRoute } from "@tanstack/react-router";
import { getStore, invalidateStoreCache, updateStore } from "@/lib/db.server";
import { body, errorRef, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { autoTranslateProduct } from "@/lib/translate.server";
import type { Product } from "@/lib/types";
import { sanitizeSlug } from "./products";
import {
  deactivateGameDevicePerformance,
  syncGameDevicePerformance,
} from "@/lib/devicePerformance.server";
import { validateGameDevicePerformance } from "@/lib/devicePerformance";
import { releaseProductIdentity } from "@/lib/product-identity.server";
import { resolveCategoryType } from "@/lib/productSection";

function productSection(product: Partial<Product>, categories: Record<string, unknown>[]) {
  const categoryId = String(product.categoryId || product.category || "");
  const category = categories.find((entry) => String(entry.id || "") === categoryId);
  return resolveCategoryType(
    categoryId,
    String(category?.title || category?.name || ""),
    String(product.kind || ""),
    String(product.schemaId || ""),
  );
}

export const Route = createFileRoute("/api/admin/products/$productId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        guard(async () => {
          await requireAdmin(request);
          const productId = params.productId;
          const store = await getStore();
          const product = (store.products || []).find((p) => String(p.id) === String(productId));

          if (!product) {
            return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
          }

          return json({ success: true, product });
        }),

      PUT: async ({ request, params }) =>
        guard(async () => {
          await requireAdmin(request);
          const productId = String(params.productId || "").trim();
          if (!productId) {
            return json(
              { error: "Missing product id in path", code: "MISSING_PRODUCT_ID" },
              { status: 400 },
            );
          }

          const payload = await body<Partial<Product>>(request);
          const titleEn = (payload.titleEn || payload.title || "").trim();
          if (!titleEn) {
            return json(
              { error: "Product title is required", code: "MISSING_TITLE" },
              { status: 400 },
            );
          }

          const price = Number(payload.price);
          if (isNaN(price) || price < 0) {
            return json(
              {
                error: "Invalid price: price must be a non-negative number",
                code: "INVALID_PRICE",
              },
              { status: 400 },
            );
          }

          let cost = 0;
          if (
            payload.cost !== undefined &&
            payload.cost !== null &&
            String(payload.cost).trim() !== ""
          ) {
            cost = Number(payload.cost);
            if (isNaN(cost) || cost < 0) {
              return json(
                { error: "Invalid cost: cost must be a non-negative number", code: "INVALID_COST" },
                { status: 400 },
              );
            }
          }

          const slug = sanitizeSlug(payload.slug || titleEn, productId);

          const currentStore = await getStore();
          const existingCatalog = currentStore.products || [];
          const slugConflict = existingCatalog.find(
            (p) =>
              String(p.id) !== productId &&
              Boolean(p.slug) &&
              String(p.slug).toLowerCase() === slug.toLowerCase(),
          );
          if (slugConflict) {
            return json(
              {
                error: `Duplicate slug: "${slug}" is already in use by product "${slugConflict.title || slugConflict.titleEn || slugConflict.id}".`,
                code: "DUPLICATE_SLUG",
              },
              { status: 400 },
            );
          }

          let productToSave: Product = {
            ...payload,
            id: productId,
            title: payload.title || titleEn,
            titleEn,
            slug,
            price,
            cost,
            stock: payload.isInfiniteStock ? 999999 : Number(payload.stock) || 0,
            status: payload.status || "نشط",
            isActive: payload.isActive !== false,
            categoryId: payload.categoryId || (payload as any).category || "cat_nintendo",
          };

          if (productSection(productToSave, currentStore.categories || []) === "game") {
            const performanceIssues = validateGameDevicePerformance(
              productToSave as Record<string, unknown>,
            );
            if (performanceIssues.length) {
              return json(
                {
                  error: performanceIssues.map((issue) => issue.message).join("\n"),
                  code: "DEVICE_PERFORMANCE_REQUIRED",
                  issues: performanceIssues,
                },
                { status: 400 },
              );
            }
          }

          try {
            productToSave = await autoTranslateProduct(productToSave);
          } catch (transErr) {
            console.warn("[autoTranslateProduct] Translation fallback triggered:", transErr);
          }

          try {
            const updated = await updateStore((store) => {
              const products = store.products || [];
              const index = products.findIndex((p) => String(p.id) === productId);
              let nextProducts: Product[];
              if (index >= 0) {
                nextProducts = [...products];
                nextProducts[index] = { ...products[index], ...productToSave };
              } else {
                nextProducts = [productToSave, ...products];
              }
              return {
                ...store,
                products: nextProducts,
              };
            });

            const saved =
              (updated.products || []).find((p) => String(p.id) === productId) || productToSave;
            if (productSection(saved, updated.categories || []) === "game") {
              const hardware = (updated.products || []).filter(
                (item) => productSection(item, updated.categories || []) === "hardware",
              );
              await syncGameDevicePerformance(saved, hardware);
            }
            return json({ success: true, product: saved });
          } catch (dbErr: any) {
            console.error("[UpdateProduct:DatabaseError]", dbErr);
            return json(
              {
                error: `Database save failed: ${dbErr?.message || "Internal database error"}`,
                code: "DATABASE_SAVE_FAILED",
              },
              { status: 500 },
            );
          }
        }),

      DELETE: async ({ request, params }) =>
        guard(async () => {
          await requireAdmin(request);
          const productId = String(params.productId || "").trim();
          if (!productId) {
            return json(
              { error: "Missing product id in path", code: "MISSING_PRODUCT_ID" },
              { status: 400 },
            );
          }

          await updateStore((store) => ({
            ...store,
            products: (store.products || []).filter((p) => String(p.id) !== productId),
          }));

          // Same check as the collection route: confirm from D1 that it is gone.
          invalidateStoreCache();
          const after = await getStore();
          if ((after.products || []).some((p) => String(p.id) === productId)) {
            const ref = errorRef();
            console.error("[DeleteProduct:still_present]", { productId, ref });
            return json(
              {
                error: "Product is still in the catalogue after delete",
                code: "DELETE_FAILED",
                ref,
              },
              { status: 500 },
            );
          }

          await deactivateGameDevicePerformance(productId);
          // Same reason as the collection route: a stale identity row would
          // reserve this game's title+platform forever.
          await releaseProductIdentity(productId);

          return json({ success: true, id: productId });
        }),
    },
  },
});
