import { createFileRoute } from "@tanstack/react-router";
import { getStore, invalidateStoreCache, updateStore } from "@/lib/db.server";
import { body, errorRef, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Run } from "@/lib/d1.server";
import { autoTranslateProduct } from "@/lib/translate.server";
import {
  findConflictingProduct,
  findDuplicateProducts,
  normalizeProductPlatform,
  normalizeProductTitle,
} from "@/lib/product-identity";
import {
  claimProductIdentityAgainstCatalogue,
  hardDeleteProductRelations,
  pruneOrphanProductIdentities,
  reindexProductIdentities,
  releaseProductIdentity,
} from "@/lib/product-identity.server";
import type { Product, StoreDoc } from "@/lib/types";
import {
  deactivateGameDevicePerformance,
  syncGameDevicePerformance,
} from "@/lib/devicePerformance.server";
import { validateGameDevicePerformance } from "@/lib/devicePerformance";
import { resolveCategoryType } from "@/lib/productSection";
import { sanitizeAndVerifyProductImages } from "@/lib/productImageVerification.server";

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

function performanceValidation(product: Partial<Product>, categories: Record<string, unknown>[]) {
  return productSection(product, categories) === "game"
    ? validateGameDevicePerformance(product as Record<string, unknown>).filter(
        (issue) => issue.severity === "error",
      )
    : [];
}

function hardwareProducts(products: Product[], categories: Record<string, unknown>[]) {
  return products.filter((product) => productSection(product, categories) === "hardware");
}

/**
 * A free slug for a copy of a product that already exists.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((value) => String(value).toLowerCase()));
  if (!used.has(desired.toLowerCase())) return desired;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${desired}-${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${desired}-${Date.now().toString(36)}`;
}

export function sanitizeSlug(input: string, fallbackId: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned) return cleaned;
  const fallbackClean = fallbackId.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `product-${fallbackClean || Date.now().toString(36)}`;
}

export const Route = createFileRoute("/api/admin/products")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const startTime = Date.now();
          const reqId = Math.random().toString(36).slice(2, 9);
          console.log(`[ADMIN_PRODUCTS_LOAD_START] reqId=${reqId} time=${new Date().toISOString()}`);

          await requireAdmin(request);
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          const slug = url.searchParams.get("slug");
          const page = parseInt(url.searchParams.get("page") || "0", 10);
          const limit = parseInt(url.searchParams.get("limit") || "0", 10);
          const search = url.searchParams.get("search")?.toLowerCase().trim();

          let store: StoreDoc;
          try {
            store = await getStore();
            console.log(`[D1_HEALTH_OK] reqId=${reqId} loadDurationMs=${Date.now() - startTime}`);
          } catch (dbErr) {
            console.error(`[D1_HEALTH_FAILED] reqId=${reqId}`, dbErr);
            throw dbErr;
          }

          let products = store.products || [];
          console.log(`[D1_PRODUCTS_COUNT] reqId=${reqId} rawCount=${products.length}`);

          if (id) {
            const product = products.find((p) => String(p.id) === String(id));
            if (!product) {
              return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
            }
            return json({ success: true, product });
          }

          if (slug) {
            const product = products.find(
              (p) => p.slug && p.slug.toLowerCase() === slug.toLowerCase(),
            );
            if (!product) {
              return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
            }
            return json({ success: true, product });
          }

          if (url.searchParams.get("duplicates")) {
            const duplicates = findDuplicateProducts(products);
            const orphanIdentities = await pruneOrphanProductIdentities(products);
            const { indexed, unindexed } = await reindexProductIdentities(products);
            return json({
              success: true,
              duplicateGroups: duplicates.length,
              affectedProducts: duplicates.reduce((sum, g) => sum + g.products.length, 0),
              duplicates,
              orphanIdentities,
              indexed,
              unindexed,
            });
          }

          if (search) {
            products = products.filter(
              (p) =>
                (p.title && p.title.toLowerCase().includes(search)) ||
                (p.titleEn && p.titleEn.toLowerCase().includes(search)) ||
                (p.slug && p.slug.toLowerCase().includes(search)) ||
                (p.id && String(p.id).toLowerCase().includes(search)),
            );
          }

          const total = products.length;
          let paginated = products;
          if (limit > 0) {
            const offset = Math.max(0, (page > 0 ? page - 1 : 0) * limit);
            paginated = products.slice(offset, offset + limit);
          }

          const totalDuration = Date.now() - startTime;
          console.log(`[PRODUCTS_FETCHED] reqId=${reqId} count=${paginated.length} total=${total} durationMs=${totalDuration}`);

          return json({
            success: true,
            products: paginated,
            d1Count: total,
            total,
            d1Healthy: true,
            durationMs: totalDuration,
          });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<Partial<Product>>(request);

          /*
            The ZIP batch importer opts into one behaviour change and nothing
            else: a product whose slug is already taken is stored as a flagged,
            hidden copy instead of being refused, because the point of the batch
            run is that it never stops on one file. Every other caller — the add
            product form, the single-game import — is untouched.
          */
          const batchImport = (payload as Record<string, unknown>)["batchImport"] === true;
          // A transport flag, never a stored product field.
          delete (payload as Record<string, unknown>)["batchImport"];

          // 1. Ensure/validate stable ID
          let productId =
            payload.id !== undefined && payload.id !== null ? String(payload.id).trim() : "";
          if (!productId) {
            productId = `prd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
          }

          // 2. Validate title
          const titleEn = (payload.titleEn || payload.title || "").trim();
          if (!titleEn) {
            return json(
              { error: "Product title is required", code: "MISSING_TITLE" },
              { status: 400 },
            );
          }

          // 3. Validate price
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

          // 4. Validate cost
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

          // 5. Validate & normalize slug
          let slug = sanitizeSlug(payload.slug || titleEn, productId);

          const currentStore = await getStore();
          const existingCatalog = currentStore.products || [];

          /*
            6. The same game must not be added twice.

            Slug uniqueness alone did not catch it: `sanitizeSlug` strips
            everything outside `[a-z0-9]`, so an Arabic title produces an empty
            slug, falls back to `product-<id>` — unique by construction — and
            the same game could be added over and over. Titles differing only
            in case, spacing, punctuation or which alef was typed slipped
            through the same way.
          */
          const platformInput = typeof payload.platform === "string" ? payload.platform : null;
          const duplicate = batchImport
            ? null
            : findConflictingProduct(
                {
                  id: productId,
                  title: payload.title || titleEn,
                  titleEn,
                  platform: platformInput,
                },
                existingCatalog,
                productId,
              );
          if (duplicate) {
            return json(
              {
                error: `منتج بنفس الاسم موجود بالفعل على هذه المنصة: "${duplicate.title || duplicate.titleEn || duplicate.id}"`,
                code: "PRODUCT_ALREADY_EXISTS",
                existingProductId: String(duplicate.id),
                normalizedTitle: normalizeProductTitle(payload.title || titleEn),
                platform: normalizeProductPlatform(platformInput),
              },
              { status: 409 },
            );
          }

          /*
            The catalogue check above is a read followed by a write, so two
            admins saving at the same moment can both pass it. The identity
            table closes that window with a real unique constraint.
          */
          const claim = await claimProductIdentityAgainstCatalogue(
            { id: productId, title: payload.title || titleEn, titleEn, platform: platformInput },
            existingCatalog,
          );
          if (!claim.ok && !batchImport) {
            return json(
              {
                error: `منتج بنفس الاسم موجود بالفعل على هذه المنصة: "${claim.conflictTitle || claim.conflictProductId}"`,
                code: "PRODUCT_ALREADY_EXISTS",
                ...(claim.conflictProductId ? { existingProductId: claim.conflictProductId } : {}),
              },
              { status: 409 },
            );
          }

          // 6. Check slug uniqueness against other products only
          const slugConflict = existingCatalog.find(
            (p) =>
              String(p.id) !== productId &&
              Boolean(p.slug) &&
              String(p.slug).toLowerCase() === slug.toLowerCase(),
          );
          if (slugConflict && !batchImport) {
            return json(
              {
                error: `Duplicate slug: "${slug}" is already in use by product "${slugConflict.title || slugConflict.titleEn || slugConflict.id}".`,
                code: "DUPLICATE_SLUG",
              },
              { status: 400 },
            );
          }

          /*
            Duplicate detection for a batch import is the slug and nothing else:
            no title similarity, no platform matching, no merging. The product
            already in the catalogue is left completely alone; the incoming copy
            is stored hidden and flagged so an admin decides what happens to it.
          */
          const duplicateFields: Partial<Product> = {};
          if (slugConflict) {
            duplicateFields.isDuplicate = true;
            duplicateFields.duplicateOriginalSlug = slug;
            duplicateFields.isHidden = true;
            slug = uniqueSlug(
              slug,
              existingCatalog
                .filter((p) => String(p.id) !== productId && Boolean(p.slug))
                .map((p) => String(p.slug)),
            );
          }

          // 7. Assemble product object with all fields
          let productToSave: Product = {
            ...payload,
            ...duplicateFields,
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

          const performanceIssues = performanceValidation(
            productToSave,
            currentStore.categories || [],
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

          // 8. Auto-translate ONLY this single product
          try {
            productToSave = await autoTranslateProduct(productToSave);
          } catch (transErr) {
            console.warn(
              "[autoTranslateProduct] Translation fallback triggered for single product:",
              transErr,
            );
          }

          // 8b. Background Image WebP Ingestion
          // Run detached to prevent blocking the save response.
          void (async () => {
            try {
              const imgVerification = await sanitizeAndVerifyProductImages(productToSave);
              if (imgVerification.results && imgVerification.results.some((r: any) => r.status === "stored")) {
                 await d1Run(
                    `UPDATE store_kv SET value = ?, updated_at = ? WHERE key = ?`,
                    JSON.stringify(imgVerification.product),
                    new Date().toISOString(),
                    `store:product:${productId}`
                 );
                 invalidateStoreCache();
              }
            } catch (imgErr) {
              console.warn("[BackgroundImgIngestError]", imgErr);
            }
          })();

          // 9. Save single product to database (Granular Save)
          try {
            await d1Run(
              `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              `store:product:${productId}`,
              JSON.stringify(productToSave),
              new Date().toISOString(),
            );

            // Invalidate the store cache so loadStore picks up the new granular product
            invalidateStoreCache();

            const saved = productToSave;

            if (productSection(saved, currentStore.categories || []) === "game") {
              syncGameDevicePerformance(
                saved,
                hardwareProducts(existingCatalog, currentStore.categories || []),
              ).catch((e) => console.error("[BackgroundSyncError]", e));
            }
            return json({ success: true, product: saved });
          } catch (dbErr: any) {
            const ref = errorRef();
            console.error("[SaveProduct:DatabaseError]", {
              operation: "create",
              productId,
              ref,
              error: dbErr?.message || String(dbErr),
              stack: dbErr?.stack,
            });
            return json(
              {
                error: `Database save failed: ${dbErr?.message || "Internal database error"}`,
                code: "DATABASE_SAVE_FAILED",
                ref,
              },
              { status: 500 },
            );
          }
        }),

      PATCH: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<Partial<Product>>(request);

          const productId =
            payload.id !== undefined && payload.id !== null ? String(payload.id).trim() : "";
          if (!productId) {
            return json(
              { error: "Missing product id for patch", code: "MISSING_PRODUCT_ID" },
              { status: 400 },
            );
          }

          const currentStore = await getStore();
          const existingCatalog = currentStore.products || [];
          const stored = existingCatalog.find((p) => String(p.id) === productId);

          if (!stored) {
             return json(
               { error: "Product not found", code: "PRODUCT_NOT_FOUND" },
               { status: 404 }
             );
          }

          // Dirty fields overlay
          const productToSave: Product = { ...stored, ...payload };

          // Fast DB Update (UPSERT style on KV value)
          try {
            await d1Run(
              `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              `store:product:${productId}`,
              JSON.stringify(productToSave),
              new Date().toISOString(),
            );

            // Invalidate the store cache so loadStore picks up the new granular product
            invalidateStoreCache();

            // Background syncing for Game Device Performance (only if performance arrays changed)
            if (payload.devicePerformance !== undefined && productSection(productToSave, currentStore.categories || []) === "game") {
               // Fire-and-forget sync to avoid blocking the patch response
               // Uses standard Promise chain to run in background.
               syncGameDevicePerformance(
                  productToSave,
                  hardwareProducts(existingCatalog, currentStore.categories || [])
               ).catch(e => console.error("[BackgroundSyncError]", e));
            }

            return json({ success: true, product: productToSave });
          } catch (dbErr: any) {
            console.error("[PatchProduct:DatabaseError]", dbErr);
            return json(
              {
                error: `Database save failed: ${dbErr?.message || "Internal database error"}`,
                code: "DATABASE_SAVE_FAILED",
              },
              { status: 500 },
            );
          }
        }),

      PUT: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const payload = await body<Partial<Product>>(request);

          const productId =
            payload.id !== undefined && payload.id !== null ? String(payload.id).trim() : "";
          if (!productId) {
            return json(
              { error: "Missing product id for update", code: "MISSING_PRODUCT_ID" },
              { status: 400 },
            );
          }

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

          const currentStore = await getStore();
          const existingCatalog = currentStore.products || [];
          const stored = existingCatalog.find((p) => String(p.id) === productId);

          /*
            A product's public URL is not something an unrelated edit gets to
            change. Re-deriving the slug from the title on every save meant that
            editing a product's stock silently renamed it — and, for a product
            already sharing a title with another, walked its slug straight into
            that other product's and made the save impossible. An explicit slug
            in the payload still wins.
          */
          const slug = payload.slug
            ? sanitizeSlug(String(payload.slug), productId)
            : (typeof stored?.slug === "string" && stored.slug) || sanitizeSlug(titleEn, productId);

          /*
            An edit may not walk a product onto another product's identity.

            Only a *new* collision is refused. A product that was already a
            duplicate before this edit keeps saving: blocking it would mean the
            duplicates already in the catalogue could never be corrected, which
            is the opposite of the point.
          */
          const before = stored;
          const alreadyDuplicated = before
            ? Boolean(findConflictingProduct(before, existingCatalog, productId))
            : false;
          if (!alreadyDuplicated) {
            const editPlatform = typeof payload.platform === "string" ? payload.platform : null;
            const editConflict = findConflictingProduct(
              { id: productId, title: payload.title || titleEn, titleEn, platform: editPlatform },
              existingCatalog,
              productId,
            );
            if (editConflict) {
              return json(
                {
                  error: `منتج بنفس الاسم موجود بالفعل على هذه المنصة: "${editConflict.title || editConflict.titleEn || editConflict.id}"`,
                  code: "PRODUCT_ALREADY_EXISTS",
                  existingProductId: String(editConflict.id),
                  normalizedTitle: normalizeProductTitle(payload.title || titleEn),
                  platform: normalizeProductPlatform(editPlatform),
                },
                { status: 409 },
              );
            }
            await claimProductIdentityAgainstCatalogue(
              { id: productId, title: payload.title || titleEn, titleEn, platform: editPlatform },
              existingCatalog,
            );
          }

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

          const performanceIssues = performanceValidation(
            productToSave,
            currentStore.categories || [],
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

          try {
            productToSave = await autoTranslateProduct(productToSave);
          } catch (transErr) {
            console.warn("[autoTranslateProduct] Translation fallback triggered:", transErr);
          }

          // Background Image WebP Ingestion
          // Run detached to prevent blocking the save response.
          void (async () => {
            try {
              const imgVerification = await sanitizeAndVerifyProductImages(productToSave);
              if (imgVerification.results && imgVerification.results.some((r: any) => r.status === "stored")) {
                 await d1Run(
                    `UPDATE store_kv SET value = ?, updated_at = ? WHERE key = ?`,
                    JSON.stringify(imgVerification.product),
                    new Date().toISOString(),
                    `store:product:${productId}`
                 );
                 invalidateStoreCache();
              }
            } catch (imgErr) {
              console.warn("[BackgroundImgIngestError]", imgErr);
            }
          })();

          try {
            await d1Run(
              `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              `store:product:${productId}`,
              JSON.stringify(productToSave),
              new Date().toISOString(),
            );

            // Invalidate the store cache so loadStore picks up the new granular product
            invalidateStoreCache();

            const saved = productToSave;

            if (productSection(saved, currentStore.categories || []) === "game") {
              syncGameDevicePerformance(
                saved,
                hardwareProducts(existingCatalog, currentStore.categories || []),
              ).catch((e) => console.error("[BackgroundSyncError]", e));
            }
            return json({ success: true, product: saved });
          } catch (dbErr: any) {
            const ref = errorRef();
            console.error("[UpdateProduct:DatabaseError]", {
              operation: "update",
              productId,
              ref,
              error: dbErr?.message || String(dbErr),
              stack: dbErr?.stack,
            });
            return json(
              {
                error: `Database save failed: ${dbErr?.message || "Internal database error"}`,
                code: "DATABASE_SAVE_FAILED",
                ref,
              },
              { status: 500 },
            );
          }
        }),

      DELETE: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const url = new URL(request.url);
          let id = url.searchParams.get("id");
          if (!id) {
            const bodyData = await body<{ id?: string }>(request);
            id = bodyData.id || null;
          }
          if (!id) {
            return json(
              { error: "Missing product id to delete", code: "MISSING_PRODUCT_ID" },
              { status: 400 },
            );
          }

          const targetId = String(id);
          
          await Promise.allSettled([
            d1Run(
              `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              `store:product:${targetId}`,
              JSON.stringify({ id: targetId, _deleted: true }),
              new Date().toISOString(),
            ),
            hardDeleteProductRelations(targetId),
            deactivateGameDevicePerformance(targetId),
          ]);
          
          invalidateStoreCache();

          return json({ success: true, id: targetId });
        }),
    },
  },
});
