import { createFileRoute } from "@tanstack/react-router";
import { getBinding, isProductionEnvironment, env } from "@/lib/env.server";
import { getD1 } from "@/lib/d1.server";
import { json } from "@/lib/http.server";

export const Route = createFileRoute("/api/diagnostics")({
  server: {
    handlers: {
      GET: async () => {
        let d1Working = false;
        try {
          const db = getD1();
          if (db && typeof db.prepare === "function") {
            const res = await db.prepare("SELECT 1 as val").first<{ val: number }>();
            d1Working = res?.val === 1;
          }
        } catch {
          d1Working = false;
        }

        const r2Bucket = getBinding("BANANTO_PRIVATE_BUCKET") || getBinding("BANANTO_BUCKET");
        const r2Working = Boolean(r2Bucket && typeof (r2Bucket as any).get === "function");

        const doBinding = getBinding("CHAT_REALTIME_DO");
        const doWorking = Boolean(
          doBinding &&
            (typeof (doBinding as any).get === "function" ||
              typeof (doBinding as any).idFromName === "function"),
        );

        const queueBinding = getBinding("NOTIFICATIONS_QUEUE");
        const queueWorking = Boolean(
          queueBinding && typeof (queueBinding as any).send === "function",
        );

        const appEnv =
          env("APP_ENV") || (isProductionEnvironment() ? "production" : "development");

        return json({
          worker: true,
          d1: d1Working,
          r2: r2Working,
          durableObject: doWorking,
          queue: queueWorking,
          appEnv,
        });
      },
    },
  },
});
