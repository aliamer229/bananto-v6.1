import { createFileRoute } from "@tanstack/react-router";
import { getBinding, isProductionEnvironment, env } from "@/lib/env.server";
import { getD1 } from "@/lib/d1.server";
import { getStore } from "@/lib/db.server";
import { json } from "@/lib/http.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const start = Date.now();
        let d1Status = "ERROR";
        let d1LatencyMs = 0;
        let productsReadStatus = "ERROR";
        let productsCount = 0;
        let productsLatencyMs = 0;

        // 1. Check D1 direct ping
        try {
          const db = getD1();
          if (db && typeof db.prepare === "function") {
            const d1Start = Date.now();
            const res = await db.prepare("SELECT 1 as val").first<{ val: number }>();
            d1LatencyMs = Date.now() - d1Start;
            if (res?.val === 1) {
              d1Status = "OK";
            }
          }
        } catch {
          d1Status = "ERROR";
        }

        // 2. Check Products Read
        try {
          const prodStart = Date.now();
          const store = await Promise.race([
            getStore(),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error("products_read_timeout")), 4000),
            ),
          ]);
          productsLatencyMs = Date.now() - prodStart;
          if (store && Array.isArray(store.products)) {
            productsReadStatus = "OK";
            productsCount = store.products.length;
          }
        } catch {
          productsReadStatus = "TIMEOUT/ERROR";
        }

        // 3. Check R2
        const r2Bucket = getBinding("BANANTO_PRIVATE_BUCKET") || getBinding("BANANTO_BUCKET");
        const r2Status = r2Bucket && typeof (r2Bucket as any).get === "function"
          ? "OK"
          : "NOT_CONFIGURED";

        const totalLatencyMs = Date.now() - start;

        return json({
          status: d1Status === "OK" && productsReadStatus === "OK" ? "OK" : "DEGRADED",
          worker: "OK",
          d1: d1Status,
          d1LatencyMs,
          r2: r2Status,
          productsRead: productsReadStatus,
          productsCount,
          productsLatencyMs,
          totalLatencyMs,
          timestamp: new Date().toISOString(),
          appEnv: env("APP_ENV") || (isProductionEnvironment() ? "production" : "development"),
        });
      },
    },
  },
});
