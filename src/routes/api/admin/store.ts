import { createFileRoute } from "@tanstack/react-router";
import { getStoreMeta } from "@/lib/db.server";
import { guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

/**
 * Store metadata for the admin dashboard: categories, banners, bundles,
 * content, settings, counters.
 *
 * It has always deleted `products` from its response — and until now it loaded
 * them anyway. `getStore()` reads every `store:products#NNN` chunk and every
 * per-product overlay row, joins them, parses several megabytes and normalises
 * every product, and this endpoint then threw all of that away. That is why an
 * endpoint returning a few kilobytes of settings was timing out at twenty
 * seconds beside the products endpoint. `getStoreMeta()` does not read those
 * rows at all.
 */
export const Route = createFileRoute("/api/admin/store")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const startedAt = Date.now();
          await requireAdmin(request);
          const store = await getStoreMeta();
          const { products: _products, ...storeWithoutProducts } = store as any;
          const payload = JSON.stringify(storeWithoutProducts);
          console.log(
            `[admin_store.timing] total_ms=${Date.now() - startedAt}` +
              ` bytes=${payload.length} products_loaded=false`,
          );
          return new Response(payload, {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "server-timing": `total;dur=${Date.now() - startedAt}`,
            },
          });
        }),
    },
  },
});
