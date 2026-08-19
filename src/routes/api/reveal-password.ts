import { createFileRoute } from "@tanstack/react-router";

import { decryptSecretValue } from "@/lib/crypto.server";
import { getOrder, saveOrder } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireUser } from "@/lib/session.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

/** One-time-ish reveal of a delivered account password for the order owner. */
export const Route = createFileRoute("/api/reveal-password")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const throttle = await consumeRateLimit(
            request,
            "credential-reveal",
            10,
            60 * 60,
            user.id,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
          const { orderId, itemId } = await body<{ orderId?: string; itemId?: string }>(request);
          const order = orderId ? await getOrder(orderId) : undefined;
          if (!order || (order.userId !== user.id && !user.isAdmin)) {
            return json({ error: "not_found" }, { status: 404 });
          }
          const item = order.items.find((i) => i.id === itemId);
          if (!item?.deliveryPasswordEnc || !item.credsSentAt) {
            return json({ error: "not_available" }, { status: 404 });
          }
          const password = await decryptSecretValue(item.deliveryPasswordEnc);
          if (!item.loggedInAt) {
            await saveOrder({
              ...order,
              items: order.items.map((i) =>
                i.id === item.id ? { ...i, loggedInAt: new Date().toISOString() } : i,
              ),
              updatedAt: new Date().toISOString(),
            });
          }
          return json({ password });
        }),
    },
  },
});
