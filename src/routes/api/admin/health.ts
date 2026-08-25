import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/session.server";
import { d1First } from "@/lib/d1.server";
import { guard, json } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/health")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const start = Date.now();

          let d1Select1 = false;
          let storeKvCount = 0;
          let gameCatalogCount = 0;
          let error: string | null = null;

          try {
            const check = await d1First<{ ok: number }>(`SELECT 1 as ok`);
            d1Select1 = check?.ok === 1;
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }

          try {
            const kvRow = await d1First<{ count: number }>(`SELECT count(*) as count FROM store_kv`);
            storeKvCount = Number(kvRow?.count ?? 0);
          } catch {
            // Non-fatal
          }

          try {
            const catRow = await d1First<{ count: number }>(`SELECT count(*) as count FROM game_catalog`);
            gameCatalogCount = Number(catRow?.count ?? 0);
          } catch {
            // Non-fatal
          }

          const durationMs = Date.now() - start;

          return json({
            success: d1Select1,
            d1Healthy: d1Select1,
            storeKvCount,
            gameCatalogCount,
            durationMs,
            error,
            timestamp: new Date().toISOString(),
          });
        }),
    },
  },
});
