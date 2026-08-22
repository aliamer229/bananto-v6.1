import { createFileRoute } from "@tanstack/react-router";

import {
  appendMessage,
  getOrder,
  listOrders,
  saveOrder,
  saveThread,
  getThread,
} from "@/lib/db.server";
import { decryptSecretValue } from "@/lib/crypto.server";
import { body, guard, json } from "@/lib/http.server";
import { stageCredentials } from "@/lib/orders.server";
import {
  claimNextAccount,
  getBatchProgress,
  markAccountRegistered,
  stageAccountBatch,
} from "@/lib/account-batch.server";
import { requireAdmin } from "@/lib/session.server";
import type { Order, OrderItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { redactOrder } from "./orders";

type Action =
  | "stage_account_batch"
  | "release_next_account"
  | "batch_status"
  | "set_payment"
  | "set_status"
  | "stage_credentials"
  | "send_credentials"
  | "send_verification_code"
  | "send_instructions"
  | "mark_logged_in"
  | "mark_shipped"
  | "mark_delivered"
  | "complete_order"
  | "send_discount";

interface AdminOrderBody {
  orderId?: string;
  action?: Action;
  itemId?: string;
  email?: string;
  password?: string;
  code?: string;
  text?: string;
  /** Bulk-prepared accounts for one order line. */
  accounts?: { email?: string; password?: string }[];
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

/**
 * Claim the next staged account and post it to the buyer as a credentials card,
 * exactly as a single hand-delivered account would arrive.
 */
async function deliverNextAccount(order: Order, itemId: string, adminName: string) {
  const account = await claimNextAccount(order.id, itemId);
  if (!account) return undefined;
  const item = order.items.find((entry) => entry.id === itemId);
  await appendMessage(order.threadId, {
    senderRole: "admin",
    senderName: adminName,
    kind: "item_credentials",
    body: {
      itemId,
      title: item?.title ?? "",
      email: account.email,
      ...(account.password ? { password: account.password } : {}),
      sequence: account.seq,
    },
  });
  return account;
}

function patchItem(order: Order, itemId: string, patch: Partial<OrderItem>): Order {
  return {
    ...order,
    items: order.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    updatedAt: new Date().toISOString(),
  };
}

export const Route = createFileRoute("/api/admin/orders")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const orders = await listOrders();
          return json({ orders: orders.map(redactOrder) });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          const admin = await requireAdmin(request);
          const adminName = admin.name || "الإدارة";
          const data = await body<AdminOrderBody>(request);
          const order = data.orderId ? await getOrder(data.orderId) : undefined;
          if (!order) return json({ error: "not_found" }, { status: 404 });
          const now = new Date().toISOString();
          let next: Order = order;

          switch (data.action) {
            case "set_payment": {
              next = { ...order, paymentStatus: data.paymentStatus ?? "paid", updatedAt: now };
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "system",
                body: {
                  text:
                    next.paymentStatus === "paid"
                      ? "تم تأكيد الدفع ✅ جاري تجهيز طلبك."
                      : next.paymentStatus === "rejected"
                        ? "لم نتمكن من تأكيد الدفع، الرجاء مراجعة الإيصال."
                        : "الإيصال قيد المراجعة.",
                },
              });
              break;
            }
            case "set_status": {
              next = { ...order, status: data.status ?? order.status, updatedAt: now };
              break;
            }
            case "cancel_order": {
              if (order.status === "cancelled")
                return json({ error: "already_cancelled" }, { status: 400 });

              const { d1All, d1Batch, randomId } = await import("@/lib/db.server");

              // Find if there was a wallet payment for this order
              const payments = await d1All<{ amount: number }>(
                `SELECT amount FROM wallet_transactions WHERE order_id = ? AND kind = 'payment' LIMIT 1`,
                order.id,
              );

              const wasPaidByWallet = payments.length > 0;
              const refundAmount = Math.abs(payments[0]?.amount || 0);

              if (wasPaidByWallet) {
                // Check if already refunded
                const refunds = await d1All(
                  `SELECT id FROM wallet_transactions WHERE order_id = ? AND kind = 'order_refund' LIMIT 1`,
                  order.id,
                );

                if (refunds.length === 0) {
                  // Perform safe idempotent refund
                  await d1Batch([
                    {
                      sql: `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
                      params: [refundAmount, order.userId],
                    },
                    {
                      sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
                             VALUES (?, ?, 'order_refund', ?, ?, ?, ?)`,
                      params: [
                        randomId("wlt"),
                        order.userId,
                        refundAmount,
                        `استرجاع مبلغ الطلب الملغي #${order.code}`,
                        order.id,
                        now,
                      ],
                    },
                    {
                      sql: `UPDATE orders SET status = 'cancelled', payment_status = 'rejected', updated_at = ? WHERE id = ?`,
                      params: [now, order.id],
                    },
                  ]);
                }
              } else {
                // Not paid by wallet, just cancel
                await d1Run(
                  `UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`,
                  now,
                  order.id,
                );
              }

              // Update in memory object for response
              next = {
                ...order,
                status: "cancelled",
                paymentStatus: wasPaidByWallet ? ("rejected" as any) : order.paymentStatus,
                updatedAt: now,
              };

              // Send system message
              await appendMessage(order.threadId, {
                senderRole: "system",
                kind: "system",
                body: {
                  text: wasPaidByWallet
                    ? `تم إلغاء الطلب من قبل الإدارة. تم استرجاع مبلغ (${refundAmount.toLocaleString()}) إلى محفظتك بنجاح.`
                    : "تم إلغاء الطلب من قبل الإدارة.",
                },
              });

              // Log history
              await d1Run(
                `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                randomId("osh"),
                order.id,
                order.status,
                "cancelled",
                admin.id,
                "إلغاء الطلب من قبل المشرف" + (wasPaidByWallet ? " مع استرجاع الرصيد" : ""),
                now,
              );

              return json({ order: redactOrder(next) });
            }
            case "direct_send_credentials": {
              if (!data.itemId || !data.email) {
                return json({ error: "missing_fields" }, { status: 400 });
              }
              const { stageCredentials } = await import("@/lib/orders.server");
              // 1. Save delivery info (staging)
              next = await stageCredentials(order, data.itemId, data.email, data.password);

              // 2. Send the message immediately
              const item = next.items.find((i) => i.id === data.itemId);
              if (item) {
                await appendMessage(order.threadId, {
                  senderRole: "admin",
                  senderName: adminName,
                  kind: "item_credentials", // explicit type the frontend knows
                  body: {
                    itemId: item.id,
                    title: item.title,
                    email: data.email,
                    ...(data.password ? { password: data.password } : {}),
                  },
                });
                next = patchItem(next, item.id, { credsSentAt: now });
                if (next.status === "processing") {
                  next = { ...next, status: "delivering" };
                }
              }

              await saveOrder(next);
              return json({ order: redactOrder(next) });
            }
            case "stage_credentials": {
              if (!data.itemId || !data.email)
                return json({ error: "missing_fields" }, { status: 400 });
              next = await stageCredentials(order, data.itemId, data.email, data.password);
              return json({ order: redactOrder(next) });
            }
            case "send_credentials": {
              const item = order.items.find((i) => i.id === data.itemId);
              if (!item || !item.deliveryEmail)
                return json({ error: "not_staged" }, { status: 400 });
              if (item.credsSentAt) return json({ error: "already_sent" }, { status: 409 });
              let password: string | undefined;
              if (item.deliveryPasswordEnc) {
                try {
                  password = await decryptSecretValue(item.deliveryPasswordEnc);
                } catch {
                  password = undefined;
                }
              }
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "item_credentials",
                body: {
                  itemId: item.id,
                  title: item.title,
                  email: item.deliveryEmail,
                  ...(password ? { password } : {}),
                },
              });
              next = patchItem(order, item.id, { credsSentAt: now });
              next = { ...next, status: "delivering" };
              break;
            }
            /* ----------------------- batch account prep ----------------------- */
            case "stage_account_batch": {
              if (!data.itemId || !Array.isArray(data.accounts)) {
                return json({ error: "missing_fields" }, { status: 400 });
              }
              if (data.accounts.length > 50) {
                return json({ error: "too_many_accounts" }, { status: 400 });
              }
              const added = await stageAccountBatch(
                order.id,
                data.itemId,
                data.accounts.map((entry) => ({
                  email: String(entry?.email ?? ""),
                  ...(entry?.password ? { password: String(entry.password) } : {}),
                })),
              );
              return json({
                added,
                progress: await getBatchProgress(order.id, data.itemId),
              });
            }

            case "release_next_account": {
              if (!data.itemId) return json({ error: "missing_fields" }, { status: 400 });
              const released = await deliverNextAccount(order, data.itemId, adminName);
              if (!released) {
                return json(
                  {
                    error: "nothing_to_release",
                    progress: await getBatchProgress(order.id, data.itemId),
                  },
                  { status: 409 },
                );
              }
              // Mark the line as delivered exactly as the single-account path
              // does: credsSentAt is what the support engine, the order screens
              // and the password reveal all read to decide whether anything has
              // reached the buyer yet.
              next = patchItem(order, data.itemId, {
                deliveryEmail: released.email,
                ...(order.items.find((i) => i.id === data.itemId)?.credsSentAt
                  ? {}
                  : { credsSentAt: now }),
              });
              next = { ...next, status: "delivering", updatedAt: now };
              await saveOrder(next);
              return json({
                released: released.seq,
                order: redactOrder(next),
                progress: await getBatchProgress(order.id, data.itemId),
              });
            }

            case "batch_status": {
              if (!data.itemId) return json({ error: "missing_fields" }, { status: 400 });
              return json({ progress: await getBatchProgress(order.id, data.itemId) });
            }

            case "send_verification_code": {
              if (!data.itemId || !data.code)
                return json({ error: "missing_fields" }, { status: 400 });
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "item_verification_code",
                body: { itemId: data.itemId, code: data.code },
              });
              next = patchItem(order, data.itemId, { verificationCodeSentAt: now });
              break;
            }
            case "send_instructions": {
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "instructions",
                body: { text: data.text ?? "" },
              });
              break;
            }
            case "mark_logged_in": {
              if (!data.itemId) return json({ error: "missing_fields" }, { status: 400 });
              next = patchItem(order, data.itemId, { loggedInAt: now });
              // The buyer finished this account, so the next one in the batch
              // goes out automatically — that sequencing is the whole point of
              // preparing them in bulk.
              if (await markAccountRegistered(order.id, data.itemId)) {
                const released = await deliverNextAccount(next, data.itemId, adminName);
                if (released) {
                  // A fresh account is now with the buyer, so the line is back
                  // to awaiting their registration rather than finished.
                  next = patchItem(next, data.itemId, {
                    deliveryEmail: released.email,
                    credsSentAt: now,
                    loggedInAt: undefined,
                  });
                  next = { ...next, status: "delivering" };
                }
              }
              break;
            }
            case "mark_shipped": {
              if (!data.itemId) return json({ error: "missing_fields" }, { status: 400 });
              next = patchItem(order, data.itemId, { shippedAt: now });
              next = { ...next, status: "delivering" };
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "shipping_update",
                body: { text: data.text ?? "تم شحن طلبك 🚚" },
              });
              break;
            }
            case "mark_delivered": {
              if (!data.itemId) return json({ error: "missing_fields" }, { status: 400 });
              next = patchItem(order, data.itemId, { deliveredAt: now });
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "shipping_update",
                body: { text: data.text ?? "تم تسليم طلبك ✅" },
              });
              break;
            }
            case "complete_order": {
              next = { ...order, status: "completed", updatedAt: now };
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "order_completed",
                body: { code: order.code },
              });
              await appendMessage(order.threadId, {
                senderRole: "system",
                kind: "review_request",
                body: { text: "نسعد بتقييمك لتجربة الشراء ⭐" },
              });
              const thread = await getThread(order.threadId);
              if (thread) await saveThread({ ...thread, status: "closed" });
              break;
            }
            case "send_discount": {
              await appendMessage(order.threadId, {
                senderRole: "admin",
                senderName: adminName,
                kind: "discount_code",
                body: { code: data.code ?? "", text: data.text ?? "كود خصم لطلبك القادم 🎁" },
              });
              break;
            }
            default:
              return json({ error: "unknown_action" }, { status: 400 });
          }

          next = {
            ...next,
            events: [...next.events, { type: data.action ?? "update", at: now }],
            updatedAt: now,
          };
          await saveOrder(next);

          // Notify customer via Telegram (Safe)
          try {
            const { notifyUserOrderStatus } = await import("@/lib/telegram-notifications.server");
            if (data.action === "send_credentials") {
              await notifyUserOrderStatus({
                userId: next.userId,
                order: next,
                credentialsDelivered: true,
              });
            } else if (
              data.action === "set_status" ||
              data.action === "complete_order" ||
              data.action === "set_payment"
            ) {
              const statusMap: Record<string, string> = {
                paid: "تم تأكيد الدفع ✅",
                processing: "قيد التجهيز ⏳",
                delivering: "جاري التسليم 🚀",
                completed: "مكتمل بنجاح 🎉",
                cancelled: "ملغى ❌",
              };
              await notifyUserOrderStatus({
                userId: next.userId,
                order: next,
                statusText: statusMap[next.status] || next.status,
              });
            }
          } catch (err) {
            console.warn("Failed to notify user on order update", err);
          }

          return json({ order: redactOrder(next) });
        }),
    },
  },
});
