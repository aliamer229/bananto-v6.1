import { createFileRoute } from "@tanstack/react-router";

import {
  getStore,
  updateStore,
  getAdminAvailabilityStatus,
  getAdminAvailabilityConfig,
  saveAdminAvailabilityConfig,
} from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getSessionUser } from "@/lib/session.server";
import { autoTranslateProduct, autoTranslateBundle } from "@/lib/translate.server";

import { forceFullImport } from "@/lib/force-import.server";
import { isProductHidden } from "@/lib/purchasable";
import type { StoreDoc, AdminAvailabilityStatus, AdminAvailabilityConfig } from "@/lib/types";

/** Cheap, stable hash used for the ETag of the catalogue payload. */
function etagFor(payload: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    h1 = ((h1 ^ payload.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + payload.charCodeAt(i)) * 2654435761) >>> 0;
  }
  return `W/"${payload.length.toString(36)}-${h1.toString(36)}${h2.toString(36)}"`;
}

/** Fields the storefront listings need — the rest (long descriptions, media
 * galleries, account payloads) is only loaded on the product page. */
const LIST_FIELDS = [
  "id",
  "title",
  "titleEn",
  "english_name",
  "subtitle",
  "slug",
  "price",
  "status",
  "isActive",
  "kind",
  "platform",
  "category",
  "categoryId",
  "genre",
  "genres",
  "developer",
  "publisher",
  "metacriticRating",
  "metacriticScore",
  // Canonical front box cover, plus its precomputed crop rectangle — the
  // listing payload has to carry the crop or every card re-measures the file
  // in the browser. See src/lib/nintendoImages.ts.
  "cartridgeImage",
  "cartridgeImageTrim",
  // Square artwork for compact cards; never a cover substitute.
  "nintendoCardImage",
  "image",
  "coverImage",
  "coverImageTrim",
  "coverUrl",
  "box_front_url",
  "banner",
  "bannerImage",
  "gallery",
  "galleryImages",
  "releaseDate",
  "release_date",
  "releaseYear",
  "options",
  "types",
] as const;

const PRIVATE_PRODUCT_FIELDS = new Set([
  "cost",
  "costPrice",
  "baseCost",
  "wholesalePrice",
  "supplier",
  "supplierId",
  "internalNotes",
  "credentials",
  "accountCredentials",
  "deliveryPasswordEnc",
  "dataConfidence",
  "modelInfo",
  "rawData",
]);

const PRIVATE_KEY_PATTERN =
  /(?:password|passwd|secret|token|credential|service.?role|api.?key|private.?key|webhook|supplier|wholesale|internal|raw.?data|model.?info|data.?confidence|cost)/i;

function redactPrivateKeys(value: unknown, depth = 0): unknown {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => redactPrivateKeys(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRIVATE_KEY_PATTERN.test(key))
      .map(([key, child]) => [key, redactPrivateKeys(child, depth + 1)]),
  );
}

function publicProduct(product: Record<string, unknown>) {
  return redactPrivateKeys(
    Object.fromEntries(Object.entries(product).filter(([key]) => !PRIVATE_PRODUCT_FIELDS.has(key))),
  ) as Record<string, unknown>;
}

function publicStore(
  store: StoreDoc,
  availability?: AdminAvailabilityStatus,
): StoreDoc & { adminAvailability?: AdminAvailabilityStatus } {
  return {
    ...(redactPrivateKeys(store) as StoreDoc),
    /*
      A hidden product is not redacted, it is absent: the public catalogue is
      what every storefront surface reads (home, sections, search, strips,
      bundles and the product page all resolve against it), so dropping it here
      is what makes "hidden" mean hidden everywhere at once. Admins receive the
      unfiltered store further down and keep seeing all of them.
    */
    products: (store.products ?? [])
      .filter((product) => !isProductHidden(product))
      .map((product) => publicProduct(product) as StoreDoc["products"][number]),
    bundles: (store.bundles ?? []).filter((b) => b.isActive !== false),
    quickReplies: [],
    autoReplies: {},
    adminPresence: { online: availability?.isAvailable ?? false },
    adminAvailability: availability,
    gameRequests: [],
    discTrades: [],
    visits: 0,
    views: 0,
  };
}

function slimStore(store: any) {
  const products = Array.isArray(store?.products) ? store.products : [];
  return {
    ...store,
    bundles: Array.isArray(store?.bundles) ? store.bundles : [],
    products: products.map((p: any) => {
      const out: Record<string, unknown> = {};
      for (const key of LIST_FIELDS) if (p?.[key] !== undefined) out[key] = p[key];
      const images = Array.isArray(p?.images) ? p.images.slice(0, 1) : undefined;
      if (images) out["images"] = images;
      return out;
    }),
  };
}

/**
 * Serialised public catalogue, memoised per store snapshot.
 *
 * Building it means a deep recursive redaction walk over every product plus a
 * JSON.stringify of the whole catalogue, and it was repeated for every
 * anonymous request. `getStore()` hands back the same object reference for as
 * long as its cache is warm, so that reference is the cache key — a refreshed
 * store is a new object and the memo drops itself.
 *
 * Availability flips independently of the catalogue, so it is part of the key.
 */
let publicPayloadCache:
  | {
      store: StoreDoc;
      availabilityKey: string;
      visible: ReturnType<typeof publicStore>;
      full?: string;
      slim?: string;
    }
  | undefined;

function publicPayload(
  store: StoreDoc,
  availability: AdminAvailabilityStatus | undefined,
  slim: boolean,
): string {
  const availabilityKey = JSON.stringify(availability ?? null);
  if (
    publicPayloadCache?.store !== store ||
    publicPayloadCache.availabilityKey !== availabilityKey
  ) {
    publicPayloadCache = {
      store,
      availabilityKey,
      visible: publicStore(store, availability),
    };
  }

  const cache = publicPayloadCache;
  if (slim) return (cache.slim ??= JSON.stringify(slimStore(cache.visible)));
  return (cache.full ??= JSON.stringify(cache.visible));
}

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          try {
            await forceFullImport();
          } catch (err) {
            console.error("[api:data] forceFullImport failed:", err);
          }
          const viewer = await getSessionUser(request);
          const availability = await getAdminAvailabilityStatus();
          const availabilityConfig = viewer?.isAdmin
            ? await getAdminAvailabilityConfig()
            : undefined;

          const store = await getStore();
          const slim = new URL(request.url).searchParams.has("slim");

          let payload: string;
          if (viewer?.isAdmin) {
            const visibleStore = {
              ...store,
              adminAvailability: availability,
              adminAvailabilityConfig: availabilityConfig,
            };
            payload = JSON.stringify(slim ? slimStore(visibleStore) : visibleStore);
          } else {
            payload = publicPayload(store, availability, slim);
          }
          const etag = etagFor(payload);
          const headers = {
            "content-type": "application/json; charset=utf-8",
            etag,
            // Browser reuses the catalogue for a minute and revalidates in the
            // background instead of blocking the render.
            "cache-control": viewer?.isAdmin
              ? "private, no-store"
              : "private, max-age=60, stale-while-revalidate=300",
          };
          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers });
          }
          return new Response(payload, { headers });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const patch = await body<
            Partial<StoreDoc> & { adminAvailabilityConfig?: Partial<AdminAvailabilityConfig> }
          >(request);

          if (patch.adminAvailabilityConfig) {
            await saveAdminAvailabilityConfig(patch.adminAvailabilityConfig);
          } else if (patch.settings?.["admin_availability"]) {
            await saveAdminAvailabilityConfig(
              patch.settings["admin_availability"] as Partial<AdminAvailabilityConfig>,
            );
          }

          // Automatically translate bundles only if small set newly added
          if (patch.bundles && Array.isArray(patch.bundles) && patch.bundles.length <= 5) {
            try {
              patch.bundles = await Promise.all(patch.bundles.map((b) => autoTranslateBundle(b)));
            } catch (err) {
              console.error("Auto-translate bundles error:", err);
            }
          }

          const updated = await updateStore((current) => {
            // Ensure every product in patch has a valid slug and stable ID
            if (patch.products && Array.isArray(patch.products)) {
              for (const p of patch.products) {
                if (!p.id) {
                  p.id = `prd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
                }
                if (!p.slug && (p.titleEn || p.title)) {
                  const raw = (p.titleEn || p.title || "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "");
                  p.slug =
                    raw ||
                    `product-${String(p.id)
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "")}`;
                }
              }
            }

            const next = { ...current, ...patch } as StoreDoc;
            // Settings are saved by several screens that each know only their
            // own keys — merge instead of replacing so nothing is wiped.
            if (patch.settings && current.settings) {
              next.settings = { ...current.settings, ...patch.settings };
            }
            return next;
          });
          return json({ success: true, data: updated });
        }),
    },
  },
});
