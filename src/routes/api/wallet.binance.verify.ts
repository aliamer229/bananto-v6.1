import { createFileRoute } from "@tanstack/react-router";
import { verifyTopUp } from "@/lib/binance-pay/service.server";
import { body, guard, json } from "@/lib/http.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { requireUser } from "@/lib/session.server";

export const Route = createFileRoute("/api/wallet/binance/verify")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);

          // Rate limit endpoint hits per user
          const throttle = await consumeRateLimit(
            request,
            "binance-verify-endpoint",
            20,
            15 * 60,
            user.id,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

          let payload: { intentId?: string; transactionId?: string };
          try {
            payload = await body<{ intentId?: string; transactionId?: string }>(request);
          } catch {
            return json(
              {
                success: false,
                code: "INVALID_REQUEST",
                message: "بيانات الطلب غير صالحة.",
              },
              { status: 400 },
            );
          }

          if (!payload.intentId || !payload.transactionId) {
            return json(
              {
                success: false,
                code: "INVALID_REQUEST",
                message: "يرجى تزويد معرف الطلب ورقم المعاملة (Transaction ID).",
              },
              { status: 400 },
            );
          }

          const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";

          const result = await verifyTopUp({
            userId: user.id,
            intentId: String(payload.intentId).trim(),
            transactionId: String(payload.transactionId).trim(),
            clientIp,
          });

          const status = result.success
            ? 200
            : result.code === "COOLDOWN_ACTIVE"
              ? 429
              : result.code === "BINANCE_TOPUP_UNAVAILABLE" ||
                  result.code === "BINANCE_TOPUP_DISABLED"
                ? 503
                : 400;

          return json(result, { status });
        }),
    },
  },
});
