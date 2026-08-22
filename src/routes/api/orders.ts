import { createFileRoute } from "@tanstack/react-router";

import {
  getMessages,
  getOrder,
  getThread,
  listOrders,
  listOrdersByUser,
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
import { isOwnUploadUrl } from "@/lib/uploads";

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

          const orders =
            user.isAdmin && url.searchParams.get("all")
              ? await listOrders()
              : await listOrdersByUser(user.id);
          return json({ orders: orders.map(redactOrder) });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const data = await body<{
            items?: CheckoutLine[];
            address?: Address;
            couponCode?: string;
            acceptedTerms?: boolean;
            idempotencyKey?: string;
          }>(request);
          const throttle = await consumeRateLimit(request, "order-create", 15, 15 * 60, user.id);
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
          if (!Array.isArray(data.items) || data.items.length > 50) {
            return json({ error: "invalid_cart" }, { status: 400 });
          }

          if (data.acceptedTerms === false) {
            return json({ error: "terms_required" }, { status: 400 });
          }

          try {
            const order = await createOrderForUser(
              user,
              data.items ?? [],
              data.address,
              data.couponCode,
              data.acceptedTerms !== false,
              data.idempotencyKey,
            );
            return json({ order: redactOrder(order) });
          } catch (error) {
            console.error("[api:orders:create_failed]", error);
            const code = error instanceof Error ? error.message : "order_failed";
            const safe = new Set([
              "cart_empty",
              "insufficient_balance",
              "invalid_total",
              "coupon_invalid",
              "terms_required",
            ]);
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
            action?:
              "claim" | "complete" | "confirm_received" | "submit_login_proof" | "account_next";
            itemId?: string;
            imageUrl?: string;
          }>(request);

          const order = await getOrder(data.orderId);
          if (!order || (order.userId !== user.id && !user.isAdmin))
            return json({ error: "not_found" }, { status: 404 });

          /**
           * The member attaches the screenshot proving they signed in.
           *
           * This is the step that unblocks the verification code, so it has to
           * be a first-class message on the order thread rather than a loose
           * image: staff need to see which account line it belongs to.
           */
          if (data.action === "submit_login_proof") {
            if (order.userId !== user.id) return json({ error: "forbidden" }, { status: 403 });
            const itemId = String(data.itemId ?? "");
            const imageUrl = String(data.imageUrl ?? "");
            const item = order.items.find((entry) => entry.id === itemId);
            if (!item) return json({ error: "item_not_found" }, { status: 404 });
            // Only the member's own upload may be attached, never an arbitrary URL.
            if (!isOwnUploadUrl(imageUrl, user.id)) {
              return json({ error: "invalid_image" }, { status: 400 });
            }

            const now = new Date().toISOString();
            if (order.threadId) {
              await appendMessage(order.threadId, {
                senderRole: "user",
                kind: "login_proof",
                body: {
                  itemId,
                  title: item.title,
                  imageUrl,
                  text: "📸 صورة إثبات تسجيل الدخول",
                },
              });
            }
            const next: Order = {
              ...order,
              items: order.items.map((entry) =>
                entry.id === itemId
                  ? { ...entry, loginProofUrl: imageUrl, loginProofAt: now }
                  : entry,
              ),
              updatedAt: now,
            };
            await saveOrder(next);
            return json({ order: redactOrder(next) });
          }

          /**
           * The member is done with the account in hand and wants the next one.
           *
           * Whether one is waiting is the server's call: a staged account is
           * released immediately, an empty queue leaves the member waiting for
           * staff, and a finished line says so.
           */
          if (data.action === "account_next") {
            if (order.userId !== user.id) return json({ error: "forbidden" }, { status: 403 });
            const itemId = String(data.itemId ?? "");
            if (!order.items.some((entry) => entry.id === itemId)) {
              return json({ error: "item_not_found" }, { status: 404 });
            }

            const { markAccountRegistered, claimNextAccount, getBatchProgress } =
              await import("@/lib/account-batch.server");
            await markAccountRegistered(order.id, itemId);
            const nextAccount = await claimNextAccount(order.id, itemId);

            if (nextAccount && order.threadId) {
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: "الدعم",
                kind: "item_credentials",
                body: {
                  itemId,
                  title: order.items.find((entry) => entry.id === itemId)?.title ?? "",
                  email: nextAccount.email,
                  ...(nextAccount.password ? { password: nextAccount.password } : {}),
                },
              });
            }

            const progress = await getBatchProgress(order.id, itemId);
            return json({
              released: nextAccount ? nextAccount.seq : null,
              waiting: !nextAccount && progress.staged === 0 && progress.sent === 0,
              progress,
              order: redactOrder((await getOrder(order.id)) ?? order),
            });
          }

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
