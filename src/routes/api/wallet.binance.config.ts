import { createFileRoute } from "@tanstack/react-router";
import { getPublicBinanceConfig } from "@/lib/binance-pay/config.server";
import { guard, json } from "@/lib/http.server";

export const Route = createFileRoute("/api/wallet/binance/config")({
  server: {
    handlers: {
      GET: async () =>
        guard(async () => {
          const config = getPublicBinanceConfig();
          return json(config, {
            headers: {
              "cache-control": "public, max-age=60, s-maxage=60",
            },
          });
        }),
    },
  },
});
