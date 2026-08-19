import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/db.server";
import { guard, json } from "@/lib/http.server";

export const Route = createFileRoute("/api/exchange-rates")({
  server: {
    handlers: {
      GET: async () =>
        guard(async () => {
          try {
            const store = await getStore();
            const manualRate = Number(store.settings?.["usdExchangeRate"]);

            // If admin has set a manual rate, use it as the source of truth
            if (manualRate > 0) {
              return json({ rates: { IQD: manualRate }, usdIqdRate: manualRate });
            }

            const response = await fetch("https://open.er-api.com/v6/latest/USD");
            if (!response.ok) throw new Error("rates_unavailable");
            const data = (await response.json()) as { rates?: Record<string, number> };
            const rates = data.rates ?? {};
            return json({ rates, usdIqdRate: rates["IQD"] ?? 1320 });
          } catch {
            return json({ rates: {}, usdIqdRate: 1320 });
          }
        }),
    },
  },
});
