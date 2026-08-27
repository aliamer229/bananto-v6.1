import { createFileRoute } from "@tanstack/react-router";
import { getCatalogVersion, getStore, invalidateStoreCache, updateStore } from "@/lib/db.server";
import { deleteProductEverywhere } from "@/lib/product-delete.server";
import { body, errorRef, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Run } from "@/lib/d1.server";
import { autoTranslateProduct } from "@/lib/translate.server";
import { parseProductSort } from "@/lib/productSort";
import {
  bootstrapProductIndex,
  DEFAULT_PAGE_SIZE,
  readProductIndexPage,
} from "@/lib/product-index.server";
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
          /*
            Stage timings, because "the products endpoint is slow" was never
            actionable. Each line names the stage, the row count, the query
            count and the response size, so a slow request in production says
            which stage it spent the time in.
          */
          const t0 = Date.now();
          const reqId = Math.random().toString(36).slice(2, 9);
          const mark = { auth: 0, query: 0, bootstrap: 0, full: 0 };

          await requireAdmin(request);
          mark.auth = Date.now() - t0;

          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          const slug = url.searchParams.get("slug");
          const wantsDuplicates = Boolean(url.searchParams.get("duplicates"));

          /*
            The listing and the full product are different endpoints wearing one
            path. The listing reads a narrow projection table; `?id=` / `?slug=`
            and the duplicate scan need whole documents, so only they pay for
            the catalogue. Keeping them apart is the point: the table used to
            load every product's full document — media, variants, Nintendo hub
            data, performance modes — to render a name and a price.
          */
          if (id || slug || wantsDuplicates) {
            const store: StoreDoc = await getStore();
            mark.full = Date.now() - t0;
            const products = store.products || [];

            if (id) {
              const product = products.find((p) => String(p.id) === String(id));
              if (!product) {
                return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
              }
              console.log(`[admin_products.full] reqId=${reqId} by=id ms=${mark.full}`);
              return json({ success: true, product });
            }

            if (slug) {
              const product = products.find(
                (p) => p.slug && p.slug.toLowerCase() === slug.toLowerCase(),
              );
              if (!product) {
                return json({ error: "Product not found", code: "NOT_FOUND" }, { status: 404 });
              }
              console.log(`[admin_products.full] reqId=${reqId} by=slug ms=${mark.full}`);
              return json({ success: true, product });
            }

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

          /*
            The order the admin asked for. It has to be applied in SQL rather
            than in the browser, because this endpoint paginates: sorting a page
            that was already sliced sorts fifty arbitrary products, not the
            catalogue. Anything unrecognised falls back to the table's existing
            default rather than erroring.
          */
          const sort = parseProductSort(url.searchParams.get("sort"), url.searchParams.get("dir"));
          const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
          const requestedPage = Number.parseInt(url.searchParams.get("page") || "", 10);
          const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
          const hiddenParam = url.searchParams.get("hidden");

          const query = {
            page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
            limit:
              Number.isFinite(requestedLimit) && requestedLimit > 0
                ? requestedLimit
                : DEFAULT_PAGE_SIZE,
            sort,
            ...(search ? { search } : {}),
            ...(url.searchParams.get("category")
              ? { categoryId: url.searchParams.get("category")! }
              : {}),
            ...(hiddenParam === "1" || hiddenParam === "true"
              ? { hidden: true }
              : hiddenParam === "0" || hiddenParam === "false"
                ? { hidden: false }
                : {}),
            ...(url.searchParams.get("unpriced") ? { onlyUnpriced: true } : {}),
            ...(url.searchParams.get("performance") ? { performanceRequired: true } : {}),
          };

          const queryStart = Date.now();
          let page = await readProductIndexPage(query);
          mark.query = Date.now() - queryStart;
          let d1Queries = 2;
          let bootstrapped = false;

          /*
            An empty projection is not the same as an empty catalogue. Before a
            first save on a database that predates this table, and after the
            table is dropped, it is simply unbuilt — so the document is read
            once, the projection is written from it, and the page is answered
            from the rebuilt table. This is the only path that still loads the
            whole catalogue, and taking it means the next request will not.
          */
          if (page.total === 0 && !search) {
            const bootStart = Date.now();
            const rev = await getCatalogVersion();
            const result = await bootstrapProductIndex(rev);
            if (result.built > 0) {
              page = await readProductIndexPage(query);
              bootstrapped = true;
              d1Queries += 3 + Math.ceil(result.built / 20);
            }
            mark.bootstrap = Date.now() - bootStart;
          }

          const body = {
            success: true,
            // `items` is the shape this endpoint means; `products` and
            // `d1Count` stay so an admin page deployed before this change keeps
            // reading the same response.
            items: page.items,
            products: page.items,
            page: page.page,
            limit: page.limit,
            total: page.total,
            d1Count: page.total,
            hasMore: page.hasMore,
            // Counts over the whole catalogue, for the filter chips.
            facets: page.facets,
            sort: sort.field,
            dir: sort.direction,
            d1Healthy: true,
            source: "product_index" as const,
            bootstrapped,
            durationMs: Date.now() - t0,
          };
          const payload = JSON.stringify(body);

          console.log(
            `[admin_products.timing] reqId=${reqId}` +
              ` total_ms=${Date.now() - t0} auth_ms=${mark.auth} query_ms=${mark.query}` +
              ` bootstrap_ms=${mark.bootstrap} rows=${page.items.length} total=${page.total}` +
              ` d1_queries=${d1Queries} bytes=${payload.length}` +
              ` page=${page.page} limit=${page.limit} sort=${sort.field}:${sort.direction}` +
              ` store_kv_touched=${bootstrapped} r2_touched=false`,
          );

          return new Response(payload, {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "server-timing": `auth;dur=${mark.auth}, query;dur=${mark.query}, bootstrap;dur=${mark.bootstrap}, total;dur=${Date.now() - t0}`,
            },
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
          const nowIso = new Date().toISOString();
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
            isHidden: payload.isHidden === true,
            categoryId: payload.categoryId || (payload as any).category || "cat_nintendo",
            category: (payload as any).category || payload.categoryId || "cat_nintendo",
            createdAt: payload.createdAt || payload.created_at || nowIso,
            created_at: payload.created_at || payload.createdAt || nowIso,
            updatedAt: nowIso,
            updated_at: nowIso,
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
            return json({ success: true, product: saved, catalogVersion: await getCatalogVersion() });
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

            return json({ success: true, product: productToSave, catalogVersion: await getCatalogVersion() });
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

          const nowIso = new Date().toISOString();
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
            isHidden: payload.isHidden === true,
            categoryId: payload.categoryId || (payload as any).category || "cat_nintendo",
            category: (payload as any).category || payload.categoryId || "cat_nintendo",
            createdAt: payload.createdAt || payload.created_at || stored?.createdAt || stored?.created_at || nowIso,
            created_at: payload.created_at || payload.createdAt || stored?.created_at || stored?.createdAt || nowIso,
            updatedAt: nowIso,
            updated_at: nowIso,
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
            return json({ success: true, product: saved, catalogVersion: await getCatalogVersion() });
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

          /*
            One owner for the whole operation — see src/lib/product-delete.server.ts.
            This used to write a `_deleted` tombstone and call
            `hardDeleteProductRelations` in the same `Promise.allSettled`, and
            that helper deletes the very `store:product:<id>` row the tombstone
            had just been written to. The aggregate catalogue was never touched,
            so the product reappeared on the next read — and this returned
            `success: true` regardless.
          */
          const result = await deleteProductEverywhere(targetId);

          if (!result.ok) {
            const ref = errorRef();
            console.error("[DeleteProduct:incomplete]", {
              productId: targetId,
              remaining: result.remaining,
              ref,
            });
            return json(
              {
                error:
                  result.error === "missing_product_id"
                    ? "Missing product id to delete"
                    : `Product still present after delete: ${result.remaining.join(", ") || "unknown"}`,
                code: "DELETE_INCOMPLETE",
                remaining: result.remaining,
                ref,
              },
              { status: 500 },
            );
          }

          return json({
            success: true,
            id: targetId,
            ...(result.slug ? { slug: result.slug } : {}),
            catalogVersion: await getCatalogVersion(),
          });
        }),
    },
  },
});
