import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/db.server";
import { json, guard } from "@/lib/http.server";
import {
  getDevicePerformanceList,
  performanceSummary,
  slugifyDevice,
} from "@/lib/devicePerformance";

export const Route = createFileRoute("/api/games/$slug/performance")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        guard(async () => {
          const store = await getStore();
          const wanted = slugifyDevice(params.slug);
          const game = (store.products || []).find(
            (product) =>
              slugifyDevice(product.slug || product.title || product.titleEn) === wanted ||
              String(product.id) === params.slug,
          );
          if (!game) return json({ error: "Game not found" }, { status: 404 });
          return json({
            game: { id: String(game.id), slug: String(game.slug || ""), title: game.title },
            performance: getDevicePerformanceList(game).map((record) => ({
              ...record,
              performanceSummary: performanceSummary(record),
            })),
          });
        }, "api:game-performance"),
    },
  },
});
