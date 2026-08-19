import { createFileRoute } from "@tanstack/react-router";
import { createTopUpIntent } from "@/lib/binance-pay/service.server";
import { body, guard, json } from "@/lib/http.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { requireUser } from "@/lib/session.server";

export const Route = createFileRoute("/api/wallet/binance/topup-intent")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);

          // Rate limit intent creation per user
          const throttle = await consumeRateLimit(
            request,
            "binance-intent-creation",
            12,
            15 * 60,
            user.id,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

          const payload = await body<{ amountUsdt?: string | number }>(request);
          if (!payload.amountUsdt) {
            return json({ error: "يرجى إدخال مبلغ التعبئة بالدولار (USDT)." }, { status: 400 });
          }

          const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";

          try {
            const result = await createTopUpIntent({
              userId: user.id,
              amountUsdt: payload.amountUsdt,
              clientIp,
            });

            return json({
              success: true,
              intent: result.intent,
              config: result.config,
              isExisting: result.isExisting,
            });
          } catch (err: any) {
            const msg = err?.message || "";

            if (msg === "BINANCE_TOPUP_UNAVAILABLE" || msg === "BINANCE_TOPUP_DISABLED") {
              return json({ error: "التعبئة عبر Binance متوقفة مؤقتًا." }, { status: 503 });
            }
            if (msg === "AMOUNT_MUST_BE_POSITIVE") {
              return json({ error: "يجب أن يكون مبلغ التعبئة أكبر من الصفر." }, { status: 400 });
            }
            if (msg.includes("PRECISION")) {
              return json(
                { error: "دقة الأرقام العشرية تتجاوز 6 خانات المسموح بها لـ USDT." },
                { status: 400 },
              );
            }
            if (msg.includes("RATE_LIMIT")) {
              return json(
                { error: "لقد تجاوزت الحد الأقصى لإنشاء طلبات التعبئة. يرجى الانتظار قليلًا." },
                { status: 429 },
              );
            }
            return json(
              { error: "المبلغ المدخل غير صالح. يرجى إدخال رقم موجب صالح." },
              { status: 400 },
            );
          }
        }),
    },
  },
});
