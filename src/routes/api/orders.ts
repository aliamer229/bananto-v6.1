import { createFileRoute } from "@tanstack/react-router";

import {
  getMessages,
  getOrder,
  getThread,
  listOrders,
  saveOrder,
  appendMessage,
  d1Run,
  d1All,
  randomId,
} from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { createOrderForUser, type CheckoutLine } from "@/lib/orders.server";
import { requireUser } from "@/lib/session.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import type { Address, Order, OrderItem } from "@/lib/types";
import { redactMessageForMember, redactOrderHistoryForMember } from "@/lib/redaction";

function redactItems(items: OrderItem[]) {
  return items.map(({ deliveryPasswordEnc: _hidden, ...item }) => ({
    ...item,
    hasStagedPassword: Boolean(_hidden),
  }));
}

export function redactOrder(order: Order) {
  return { ...order, items: redactItems(order.items) };
}

async function canTransition(oldStatus: string, newStatus: string, kind: string): Promise<boolean> {
  if (kind === "preorder") {
    if (oldStatus === "purchased" && newStatus === "cancelled") return false;
  }
  if (oldStatus === "delivered" && newStatus === "preparing") return false;
  return true;
}

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const orderId = url.searchParams.get("orderId");

          if (orderId) {
            const order = await getOrder(orderId);
            if (!order || (order.userId !== user.id && !user.isAdmin)) {
              return json({ error: "not_found" }, { status: 404 });
            }
            const thread = await getThread(order.threadId);
            const messages = await getMessages(order.threadId);
            const history = await d1All<Record<string, unknown>>(
              `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC`,
              orderId,
            );

            return json({
              order: redactOrder(order),
              thread,
              messages: user.isAdmin ? messages : messages.map(redactMessageForMember),
              history: user.isAdmin ? history : history.map(redactOrderHistoryForMember),
            });
          }

          const allOrders = await listOrders();
          const orders =
            user.isAdmin && url.searchParams.get("all")
              ? allOrders
              : allOrders.filter((o) => o.userId === user.id);
          return json({ orders: orders.map(redactOrder) });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const data = await body<{ items?: CheckoutLine[]; address?: Address }>(request);
          const throttle = await consumeRateLimit(request, "order-create", 10, 15 * 60, user.id);
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
          if (!Array.isArray(data.items) || data.items.length > 50) {
            return json({ error: "invalid_cart" }, { status: 400 });
          }

          try {
            const order = await createOrderForUser(user, data.items ?? [], data.address);
            return json({ order: redactOrder(order) });
          } catch (error) {
            console.error("[api:orders:create_failed]", error);
            const code = error instanceof Error ? error.message : "order_failed";
            const safe = new Set(["cart_empty", "insufficient_balance", "invalid_total"]);
            return json({ error: safe.has(code) ? code : "order_failed" }, { status: 400 });
          }
        }),
      PATCH: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const data = await body<{
            orderId: string;
            status?: string;
            note?: string;
            address?: Address;
            action?: "claim" | "complete" | "confirm_received";
          }>(request);

          const order = await getOrder(data.orderId);
          if (!order || (order.userId !== user.id && !user.isAdmin))
            return json({ error: "not_found" }, { status: 404 });

          // Customer confirms receipt of order/accounts
          if (data.action === "confirm_received") {
            if (order.status !== "completed") {
              const now = new Date().toISOString();
              try {
                await d1Run(
                  `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
                   VALUES (?, ?, ?, 'completed', ?, 'تم تأكيد الاستلام من قبل العميل', ?)`,
                  randomId("osh"),
                  order.id,
                  order.status,
                  user.id,
                  now,
                );

                await d1Run(
                  `INSERT INTO order_status_history_v2 (
                    id, order_id, old_status, new_status, changed_by_user_id, changed_by_role, reason, created_at
                  ) VALUES (?, ?, ?, 'completed', ?, 'USER', 'Customer confirmed order receipt', ?)`,
                  randomId("oshv2"),
                  order.id,
                  order.status,
                  user.id,
                  now,
                );

                if (order.threadId) {
                  await appendMessage(order.threadId, {
                    senderRole: "user",
                    kind: "order_completed",
                    body: {
                      text: "✅ تم استلام الطلب وتأكيده بنجاح من قبل العميل.",
                      code: order.code,
                    },
                  });
                }
              } catch (err) {
                console.error("[order:confirm_received_history_failed]", err);
              }

              const next: Order = {
                ...order,
                status: "completed",
                updatedAt: now,
                events: [
                  ...order.events,
                  { type: "order_completed", at: now, payload: { by: user.id } },
                ],
              };
              await saveOrder(next);
              return json({ order: redactOrder(next) });
            }
            return json({ order: redactOrder(order) });
          }

          // Staff Actions
          if (data.action === "claim") {
            if (!user.isAdmin) return json({ error: "forbidden" }, { status: 403 });
            const { claimOrderTask } = await import("@/lib/orders.server");
            await claimOrderTask(data.orderId, user.id);
            const next = await getOrder(data.orderId);
            return json({ order: redactOrder(next!) });
          }

          if (data.action === "complete") {
            if (!user.isAdmin) return json({ error: "forbidden" }, { status: 403 });
            const { completeOrderTask } = await import("@/lib/orders.server");
            await completeOrderTask(data.orderId, user.id);
            const next = await getOrder(data.orderId);
            return json({ order: redactOrder(next!) });
          }

          // Only admin can change status manually
          if (data.status && data.status !== order.status) {
            if (!user.isAdmin) return json({ error: "forbidden" }, { status: 403 });

            const firstKind = order.items[0]?.kind || "account";
            if (!(await canTransition(order.status, data.status, firstKind))) {
              return json({ error: "invalid_transition" }, { status: 400 });
            }

            // Log history
            await d1Run(
              `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              randomId("osh"),
              order.id,
              order.status,
              data.status,
              user.id,
              data.note || null,
              new Date().toISOString(),
            );
          }

          const next: Order = {
            ...order,
            ...(data.status ? { status: data.status as any } : {}),
            ...(data.address ? { address: data.address } : {}),
            updatedAt: new Date().toISOString(),
          };
          await saveOrder(next);
          return json({ order: redactOrder(next) });
        }),
    },
  },
});
