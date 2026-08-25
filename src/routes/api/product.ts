import { createFileRoute } from "@tanstack/react-router";

import { getStore } from "@/lib/db.server";
import { guard, json } from "@/lib/http.server";
import { getSessionUser } from "@/lib/session.server";
import { isVisibleToPublic } from "@/lib/purchasable";
import { findProductByIdOrSlug } from "@/lib/productRouting";

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

function etagFor(payload: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    h1 = ((h1 ^ payload.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + payload.charCodeAt(i)) * 2654435761) >>> 0;
  }
  return `W/"${payload.length.toString(36)}-${h1.toString(36)}${h2.toString(36)}"`;
}

/**
 * Dedicated high-performance single product retrieval endpoint.
 * Returns only the requested product's complete data (~3KB) with ETag caching.
 */
export const Route = createFileRoute("/api/product")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const url = new URL(request.url);
          const lookup = url.searchParams.get("id") || url.searchParams.get("slug") || "";

          if (!lookup.trim()) {
            return json({ error: "missing_product_identifier" }, { status: 400 });
          }

          const viewer = await getSessionUser(request);
          const store = await getStore();
          const products = store.products || [];

          const match = findProductByIdOrSlug(products, lookup);
          if (!match) {
            return json({ error: "product_not_found" }, { status: 404 });
          }

          if (!viewer?.isAdmin && !isVisibleToPublic(match)) {
            return json({ error: "product_not_found" }, { status: 404 });
          }

          const sanitized = viewer?.isAdmin
            ? match
            : (redactPrivateKeys(
                Object.fromEntries(
                  Object.entries(match).filter(([k]) => !PRIVATE_PRODUCT_FIELDS.has(k))
                )
              ) as Record<string, unknown>);

          const payload = JSON.stringify({ ok: true, product: sanitized });
          const etag = etagFor(payload);
          const headers = {
            "content-type": "application/json; charset=utf-8",
            etag,
            "cache-control": viewer?.isAdmin
              ? "private, no-store"
              : "public, max-age=120, stale-while-revalidate=600",
          };

          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers });
          }

          return new Response(payload, { headers });
        }),
    },
  },
});
