import { createFileRoute } from "@tanstack/react-router";
import {
  getAdminBinanceIntents,
  getAdminBinanceLogs,
  getAdminBinanceTopups,
} from "@/lib/binance-pay/service.server";
import { guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/admin/binance-topups")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const [topups, intents, logs] = await Promise.all([
            getAdminBinanceTopups(50),
            getAdminBinanceIntents(50),
            getAdminBinanceLogs(50),
          ]);

          return json({
            topups,
            intents,
            logs,
          });
        }),
    },
  },
});
