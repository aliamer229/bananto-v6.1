import { createFileRoute } from "@tanstack/react-router";

import { getCatalogVersion } from "@/lib/db.server";
import { guard, json } from "@/lib/http.server";
import { bootstrapProductIndex, productIndexCount } from "@/lib/product-index.server";
import { requireAdmin } from "@/lib/session.server";

/**
 * Rebuilds the admin listing projection from the catalogue.
 *
 * The projection is normally written by `persistStore` in the same batch as the
 * catalogue, so it stays true without anyone asking. This is the lever for the
 * two cases that sit outside a save: a database that predates the table, and a
 * table dropped or truncated by hand. It reads only the product rows, never the
 * whole store document.
 *
 * GET reports what the projection holds — safe to call while diagnosing.
 * POST rebuilds it. Rebuilding cannot lose data: `store_kv` is the source of
 * truth and this only re-derives from it.
 */
export const Route = createFileRoute("/api/admin/products/reindex")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const [count, rev] = await Promise.all([productIndexCount(), getCatalogVersion()]);
          return json({ success: true, indexed: count, catalogVersion: rev });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const rev = await getCatalogVersion();
          const result = await bootstrapProductIndex(rev);
          return json({
            success: true,
            indexed: result.built,
            // Named so a corrupt record can be looked up, rather than silently
            // vanishing from the table.
            skipped: result.skipped,
            durationMs: result.ms,
            catalogVersion: rev,
          });
        }),
    },
  },
});
