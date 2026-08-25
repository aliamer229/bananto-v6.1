import { createFileRoute } from "@tanstack/react-router";
import { json, guard, body } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getStore, updateStore, invalidateStoreCache } from "@/lib/db.server";
import { d1First, d1Run } from "@/lib/d1.server";
import { readBinary, writeBinary, deleteObject, hasObject } from "@/lib/storage.server";
import { processImageToWebP, isWebP } from "@/lib/imageProcessor";
import { fetchRemoteImage, readLimitedBody } from "@/lib/security.server";
import { coverTextureFetchHeaders } from "@/lib/coverTexture";
import { SINGLE_IMAGE_FIELDS, ARRAY_IMAGE_FIELDS } from "@/lib/productImageVerification.server";
import type { Product } from "@/lib/types";

interface MigrationState {
  status: "idle" | "running" | "completed" | "error";
  lastRunAt: string;
  totalProducts: number;
  processedProducts: number;
  totalConverted: number;
  totalFailed: number;
  cursor: number;
  errors: string[];
}

const MIGRATION_STATE_KEY = "system:image_migration_state";

async function getMigrationState(): Promise<MigrationState> {
  const row = await d1First<{ key: string; value: string }>(
    `SELECT value FROM store_kv WHERE key = ?`,
    MIGRATION_STATE_KEY
  );
  if (row?.value) {
    try {
      return JSON.parse(row.value);
    } catch {
      // Fallback
    }
  }
  return {
    status: "idle",
    lastRunAt: "",
    totalProducts: 0,
    processedProducts: 0,
    totalConverted: 0,
    totalFailed: 0,
    cursor: 0,
    errors: [],
  };
}

async function saveMigrationState(state: MigrationState): Promise<void> {
  await d1Run(
    `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    MIGRATION_STATE_KEY,
    JSON.stringify(state),
    new Date().toISOString()
  );
}

/**
 * Checks if a storage key is referenced anywhere in the entire catalogue.
 */
function isKeyReferencedByOtherProducts(
  allProducts: Product[],
  storageUrl: string,
  currentProductId: string
): boolean {
  for (const p of allProducts) {
    if (String(p.id) === currentProductId) continue;

    for (const f of SINGLE_IMAGE_FIELDS) {
      if ((p as any)[f] === storageUrl) return true;
    }
    for (const f of ARRAY_IMAGE_FIELDS) {
      const arr = (p as any)[f];
      if (Array.isArray(arr) && arr.includes(storageUrl)) return true;
    }
  }
  return false;
}

export const Route = createFileRoute("/api/admin/migrate-images")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const state = await getMigrationState();
          const store = await getStore();
          const products = store.products || [];

          let productsNeedingMigration = 0;
          let totalImagesNeedingMigration = 0;

          for (const product of products) {
            let prodNeeds = false;
            for (const f of SINGLE_IMAGE_FIELDS) {
              const val = (product as any)[f];
              if (val && typeof val === "string" && (!val.endsWith(".webp") || val.startsWith("http"))) {
                prodNeeds = true;
                totalImagesNeedingMigration++;
              }
            }
            for (const f of ARRAY_IMAGE_FIELDS) {
              const arr = (product as any)[f];
              if (Array.isArray(arr)) {
                for (const item of arr) {
                  if (typeof item === "string" && (!item.endsWith(".webp") || item.startsWith("http"))) {
                    prodNeeds = true;
                    totalImagesNeedingMigration++;
                  }
                }
              }
            }
            if (prodNeeds) productsNeedingMigration++;
          }

          return json({
            success: true,
            state,
            totalProductsInStore: products.length,
            productsNeedingMigration,
            totalImagesNeedingMigration,
          });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const reqBody = await body<{
            batchSize?: number;
            reset?: boolean;
          }>(request).catch(() => ({ batchSize: 25, reset: false }));

          let state = await getMigrationState();
          if (reqBody.reset) {
            state = {
              status: "idle",
              lastRunAt: new Date().toISOString(),
              totalProducts: 0,
              processedProducts: 0,
              totalConverted: 0,
              totalFailed: 0,
              cursor: 0,
              errors: [],
            };
          }

          const batchSize = Math.max(5, Math.min(100, reqBody.batchSize || 25));
          const store = await getStore();
          const allProducts = store.products || [];

          state.totalProducts = allProducts.length;
          state.status = "running";
          state.lastRunAt = new Date().toISOString();

          // Slice current batch
          const startIndex = state.cursor >= allProducts.length ? 0 : state.cursor;
          const batch = allProducts.slice(startIndex, startIndex + batchSize);

          let batchConverted = 0;
          const batchErrors: string[] = [];

          // Helper to process a single image URL
          const migrateSingleUrl = async (
            url: string | null | undefined,
            productId: string,
            fieldName: string
          ): Promise<string | null> => {
            if (!url || typeof url !== "string") return null;
            const trimmed = url.trim();
            if (!trimmed) return null;

            // If it's already an internal WebP in R2, verify existence and return
            if (trimmed.startsWith("/api/files/") && (trimmed.endsWith(".webp") || trimmed.includes(".webp?"))) {
              return trimmed;
            }

            try {
              let originalBytes: Uint8Array | null = null;
              let originalMime = "image/jpeg";
              let oldStorageKey = "";

              if (trimmed.startsWith("/api/files/")) {
                oldStorageKey = trimmed.replace("/api/files/", "files/");
                const readRes = await readBinary(oldStorageKey);
                if (readRes) {
                  originalBytes = readRes.bytes;
                  originalMime = readRes.mime;
                }
              } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                const response = await fetchRemoteImage(trimmed, {
                  headers: coverTextureFetchHeaders(trimmed),
                });
                if (response && response.ok) {
                  const bytes = await readLimitedBody(response, Infinity);
                  if (bytes && bytes.length >= 16) {
                    originalBytes = bytes;
                    originalMime = response.headers.get("content-type") || "image/jpeg";
                  }
                }
              }

              if (!originalBytes) {
                // Could not read or fetch original image; keep old link safe without losing data
                return trimmed;
              }

              // High quality for 3D textures
              const isHighQuality =
                fieldName === "coverHiResImage" ||
                fieldName.includes("3d") ||
                fieldName === "texture";

              const converted = await processImageToWebP(originalBytes, originalMime, {
                highQuality: isHighQuality,
                preserveDimensions: true,
              });

              if (!converted || !converted.bytes || converted.bytes.length === 0) {
                return trimmed;
              }

              // Compute content hash
              const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(converted.bytes));
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);

              let newKey = `files/products/${productId}/${fieldName}-${hashHex}.webp`;
              if (fieldName === "gallery" || fieldName === "screenshots") {
                newKey = `files/products/${productId}/gallery/${hashHex}.webp`;
              }

              // Upload WebP to R2
              const exists = await hasObject(newKey);
              if (!exists) {
                await writeBinary(newKey, converted.bytes, "image/webp", {
                  cacheControl: "public, max-age=31536000, immutable",
                });
              }

              // Verify the new WebP exists in R2
              const verifiedInR2 = await hasObject(newKey);
              if (!verifiedInR2) {
                throw new Error(`Verification of uploaded WebP failed for ${newKey}`);
              }

              const newUrl = `/api/files/${newKey.replace("files/", "")}`;

              // Reference-safe deletion of old object ONLY if it's internal and not used elsewhere
              if (
                oldStorageKey &&
                oldStorageKey !== newKey &&
                !isKeyReferencedByOtherProducts(allProducts, trimmed, productId)
              ) {
                try {
                  await deleteObject(oldStorageKey);
                } catch (delErr) {
                  console.warn(`[Migrate] Could not delete old object ${oldStorageKey}:`, delErr);
                }
              }

              return newUrl;
            } catch (err: any) {
              const msg = `[Product ${productId} | ${fieldName}]: ${err.message || String(err)}`;
              batchErrors.push(msg);
              state.errors.push(msg);
              return trimmed;
            }
          };

          let productsModified = false;

          for (const product of batch) {
            const prodId = String(product.id || "");
            let prodUpdated = false;

            for (const f of SINGLE_IMAGE_FIELDS) {
              const currentVal = (product as any)[f];
              if (currentVal && typeof currentVal === "string" && (!currentVal.endsWith(".webp") || currentVal.startsWith("http"))) {
                const newUrl = await migrateSingleUrl(currentVal, prodId, f);
                if (newUrl && newUrl !== currentVal) {
                  (product as any)[f] = newUrl;
                  prodUpdated = true;
                  batchConverted++;
                }
              }
            }

            for (const f of ARRAY_IMAGE_FIELDS) {
              const currentArr = (product as any)[f];
              if (Array.isArray(currentArr) && currentArr.length > 0) {
                const newArr: string[] = [];
                for (const item of currentArr) {
                  if (typeof item === "string" && (!item.endsWith(".webp") || item.startsWith("http"))) {
                    const newUrl = await migrateSingleUrl(item, prodId, f);
                    if (newUrl && newUrl !== item) {
                      newArr.push(newUrl);
                      prodUpdated = true;
                      batchConverted++;
                    } else {
                      newArr.push(item);
                    }
                  } else {
                    newArr.push(item);
                  }
                }
                (product as any)[f] = newArr;
              }
            }

            if (prodUpdated) {
              productsModified = true;
              // Granularly update product in D1
              await d1Run(
                `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                `store:product:${prodId}`,
                JSON.stringify(product),
                new Date().toISOString()
              );
            }
          }

          if (productsModified) {
            invalidateStoreCache();
          }

          state.processedProducts += batch.length;
          state.totalConverted += batchConverted;
          state.totalFailed += batchErrors.length;
          state.cursor = startIndex + batch.length;

          if (state.cursor >= allProducts.length) {
            state.status = "completed";
          }

          // Cap stored errors to last 50
          if (state.errors.length > 50) {
            state.errors = state.errors.slice(-50);
          }

          await saveMigrationState(state);

          return json({
            success: true,
            batchProcessed: batch.length,
            batchConverted,
            batchFailed: batchErrors.length,
            batchErrors,
            state,
            isComplete: state.status === "completed" || state.cursor >= allProducts.length,
          });
        }),
    },
  },
});
