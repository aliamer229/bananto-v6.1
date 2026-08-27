import { createFileRoute } from "@tanstack/react-router";

import { guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import {
  inspectProductConsistency,
  listOrphanGranularRows,
  listOrphanIdentities,
} from "@/lib/product-consistency.server";

/**
 * Answers "why is this product still showing?" against real production data.
 *
 * A product is stored in several places, and the failures that matter are
 * disagreements between them — deleted from the aggregate but still holding its
 * identity, hidden but still in the public listing, present in a granular row
 * that overrides the catalogue. None of that is visible from the admin table,
 * and none of it can be reproduced locally, because the only copy of the data
 * is in production D1.
 *
 * Admin-only and read-only. It changes nothing: the repair path is a separate,
 * explicit script (`npm run repair:products`).
 *
 *   GET /api/admin/products/diagnose?q=<slug-or-id>
 *   GET /api/admin/products/diagnose?orphans=1
 */
export const Route = createFileRoute("/api/admin/products/diagnose")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);

          const url = new URL(request.url);
          const query = (url.searchParams.get("q") || "").trim();
          const wantOrphans = url.searchParams.has("orphans");

          if (!query && !wantOrphans) {
            return json(
              {
                error: "Pass ?q=<slug-or-product-id> to inspect one product, or ?orphans=1.",
                code: "MISSING_QUERY",
              },
              { status: 400 },
            );
          }

          if (wantOrphans) {
            const [identities, granular] = await Promise.all([
              listOrphanIdentities(),
              listOrphanGranularRows(),
            ]);
            return json(
              {
                success: true,
                orphanIdentities: identities,
                orphanGranularRows: granular,
                note:
                  identities.length || granular.length
                    ? "Run `npm run repair:products -- --dry-run` to see the plan, then `--apply`."
                    : "Nothing orphaned.",
              },
              { headers: { "cache-control": "no-store" } },
            );
          }

          const report = await inspectProductConsistency(query);
          return json(
            { success: true, report },
            { headers: { "cache-control": "no-store" } },
          );
        }, "api/admin/products/diagnose"),
    },
  },
});
