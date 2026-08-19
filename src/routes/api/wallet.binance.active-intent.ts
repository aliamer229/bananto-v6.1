import { createFileRoute } from "@tanstack/react-router";
import { getPublicBinanceConfig } from "@/lib/binance-pay/config.server";
import { getActiveTopUpIntent } from "@/lib/binance-pay/service.server";
import { guard, json } from "@/lib/http.server";
import { requireUser } from "@/lib/session.server";

export const Route = createFileRoute("/api/wallet/binance/active-intent")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const activeIntent = await getActiveTopUpIntent(user.id);
          const config = getPublicBinanceConfig();

          return json({
            activeIntent,
            config,
          });
        }),
    },
  },
});
