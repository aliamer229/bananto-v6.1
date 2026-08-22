import { createFileRoute } from "@tanstack/react-router";

import {
  appendMessage,
  getOrder,
  listOrders,
  saveOrder,
  saveThread,
  getThread,
  deleteOrder,
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
  | "cancel_order"
  | "delete_order"
  | "direct_send_credentials"
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
  threadId?: string;
  action?: Action;
  itemId?: string;
  email?: string;
  password?: string;
  code?: string;
  text?: string;
  title?: string;
  /** Bulk-prepared accounts for one order line. */
  accounts?: { email?: string; password?: string }[];
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

async function resolveThreadId(order: Order, explicitThreadId?: string): Promise<string> {
  if (explicitThreadId) return explicitThreadId;
  if (order.threadId) return order.threadId;
  try {
    const { listThreadsByUser } = await import("@/lib/db.server");
    const threads = await listThreadsByUser(order.userId);
    const found = threads.find((t) => t.orderId === order.id || t.orderId === order.code);
    return found?.id || "";
  } catch {
    return "";
  }
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
      DELETE: async ({ request }) =>
        guard(async () => {
          const admin = await requireAdmin(request);
          const url = new URL(request.url);
          let orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
          if (!orderId) {
            const bodyData = await body<{ orderId?: string; id?: string }>(request).catch(
              () => ({}),
            );
            orderId = bodyData.orderId || bodyData.id || "";
          }
          if (!orderId) return json({ error: "معرّف الطلب مطلوب" }, { status: 400 });

          const order = await getOrder(orderId);
          if (!order) return json({ error: "الطلب غير موجود" }, { status: 404 });

          // Reject deletion if active and paid (must be cancelled/refunded first)
          if (order.paymentStatus === "paid" && order.status !== "cancelled") {
            return json(
              { error: "لا يمكن حذف طلب مدفوع ونشط. يجب إلغاء الطلب واسترجاع الرصيد أولاً." },
              { status: 400 },
            );
          }

          await deleteOrder(orderId);

          // Record audit log
          try {
            const { d1Run, randomId } = await import("@/lib/db.server");
            await d1Run(
              `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              randomId("aud"),
              admin.id,
              "delete_order",
              "order",
              orderId,
              JSON.stringify({ code: order.code, status: order.status, total: order.total }),
              new Date().toISOString(),
            );
          } catch {
            // Ignore if schema mismatch
          }

          return json({ success: true, message: "تم حذف الطلب بنجاح" });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          const admin = await requireAdmin(request);
          const adminName = admin.name || "الإدارة";
          const data = await body<AdminOrderBody>(request);
          let order = data.orderId ? await getOrder(data.orderId) : undefined;
          if (!order && data.threadId) {
            const thread = await getThread(data.threadId);
            if (thread?.orderId) {
              order = await getOrder(thread.orderId);
            }
          }
          if (!order) return json({ error: "الطلب غير موجود" }, { status: 404 });
          const now = new Date().toISOString();
          let next: Order = order;

          switch (data.action) {
            case "delete_order": {
              if (order.paymentStatus === "paid" && order.status !== "cancelled") {
                return json(
                  { error: "لا يمكن حذف طلب مدفوع ونشط. يجب إلغاء الطلب واسترجاع الرصيد أولاً." },
                  { status: 400 },
                );
              }

              await deleteOrder(order.id);

              try {
                const { d1Run, randomId } = await import("@/lib/db.server");
                await d1Run(
                  `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  randomId("aud"),
                  admin.id,
                  "delete_order",
                  "order",
                  order.id,
                  JSON.stringify({ code: order.code, status: order.status, total: order.total }),
                  now,
                );
              } catch {
                // Ignore if schema mismatch
              }

              return json({ success: true, message: "تم حذف الطلب بنجاح" });
            }
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
                return json({ error: "الطلب ملغي بالفعل" }, { status: 400 });

              const { d1All, d1Batch, randomId } = await import("@/lib/db.server");

              // Find if there was a wallet payment for this order
              const payments = await d1All<{ amount: number }>(
                `SELECT amount FROM wallet_transactions WHERE order_id = ? AND kind = 'payment' LIMIT 1`,
                order.id,
              );

              const wasPaidByWallet = payments.length > 0;
              const refundAmount = Math.abs(payments[0]?.amount || 0);

              if (wasPaidByWallet && refundAmount > 0) {
                // Check if already refunded (Idempotency check)
                const refunds = await d1All(
                  `SELECT id FROM wallet_transactions WHERE order_id = ? AND kind = 'order_refund' LIMIT 1`,
                  order.id,
                );

                if (refunds.length === 0) {
                  // Perform safe idempotent atomic refund
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
                // Not paid by wallet, update status
                const { d1Run } = await import("@/lib/db.server");
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

              // Log history and audit log
              try {
                const { d1Run, randomId } = await import("@/lib/db.server");
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
                await d1Run(
                  `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  randomId("aud"),
                  admin.id,
                  "cancel_order",
                  "order",
                  order.id,
                  JSON.stringify({
                    code: order.code,
                    refunded: wasPaidByWallet ? refundAmount : 0,
                  }),
                  now,
                );
              } catch {
                // Ignore if schema mismatch
              }

              await saveOrder(next);
              return json({ order: redactOrder(next) });
            }
            case "direct_send_credentials": {
              if (!data.itemId || !data.email) {
                return json({ error: "البريد الإلكتروني ومعرف العنصر مطلوبان" }, { status: 400 });
              }
              const { stageCredentials } = await import("@/lib/orders.server");
              // 1. Save delivery info (staging)
              next = await stageCredentials(order, data.itemId, data.email, data.password);

              // 2. Send the message immediately
              const item = next.items.find((i) => i.id === data.itemId);
              if (item) {
                const targetThreadId = await resolveThreadId(order, data.threadId);
                if (targetThreadId) {
                  await appendMessage(targetThreadId, {
                    senderRole: "admin",
                    senderName: adminName,
                    kind: "item_credentials",
                    body: {
                      itemId: item.id,
                      title: item.title,
                      email: data.email,
                      ...(data.password ? { password: data.password } : {}),
                    },
                  });
                }
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
                return json({ error: "البريد الإلكتروني ومعرف العنصر مطلوبان" }, { status: 400 });
              next = await stageCredentials(order, data.itemId, data.email, data.password);
              return json({ order: redactOrder(next) });
            }
            case "send_credentials": {
              const item = order.items.find((i) => i.id === data.itemId);
              if (!item || !item.deliveryEmail)
                return json({ error: "لم يتم تجهيز بيانات هذا العنصر بعد" }, { status: 400 });
              if (item.credsSentAt)
                return json({ error: "تم إرسال البيانات مسبقاً" }, { status: 409 });
              let password: string | undefined;
              if (item.deliveryPasswordEnc) {
                try {
                  password = await decryptSecretValue(item.deliveryPasswordEnc);
                } catch {
                  password = undefined;
                }
              }
              const targetThreadId = await resolveThreadId(order, data.threadId);
              if (targetThreadId) {
                await appendMessage(targetThreadId, {
                  senderRole: "admin",
                  senderName: adminName,
                  kind: "item_credentials",
                  body: {
                    itemId: item.id,
                    title: item.title,
                    email: item.deliveryEmail,
                    ...(password ? { password: password } : {}),
                  },
                });
              }
              next = patchItem(order, item.id, { credsSentAt: now });
              next = { ...next, status: "delivering" };
              break;
            }
            /* ----------------------- batch account prep ----------------------- */
            case "stage_account_batch": {
              if (!data.itemId || !Array.isArray(data.accounts)) {
                return json({ error: "الحسابات المجهزة ومعرف العنصر مطلوبان" }, { status: 400 });
              }
              if (data.accounts.length > 50) {
                return json({ error: "الحد الأقصى للتجهيز الدفعي هو 50 حساباً" }, { status: 400 });
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
              if (!data.itemId) return json({ error: "معرف العنصر مطلوب" }, { status: 400 });
              const released = await deliverNextAccount(order, data.itemId, adminName);
              if (!released) {
                return json(
                  {
                    error: "لا توجد حسابات مجهزة للتسليم في هذه الدفعة",
                    progress: await getBatchProgress(order.id, data.itemId),
                  },
                  { status: 409 },
                );
              }
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
              if (!data.itemId) return json({ error: "معرف العنصر مطلوب" }, { status: 400 });
              return json({ progress: await getBatchProgress(order.id, data.itemId) });
            }

            case "send_verification_code": {
              const code = String(data.code ?? "").trim();
              if (!code) {
                return json({ error: "يرجى إدخال كود التحقق (OTP)" }, { status: 400 });
              }

              let item = order.items.find((i) => i.id === data.itemId);
              if (!item && data.itemId) {
                item = order.items.find(
                  (i) =>
                    i.id.endsWith(data.itemId!) ||
                    i.id.includes(data.itemId!) ||
                    data.itemId!.includes(i.id),
                );
              }
              if (!item) {
                item = order.items.find((i) => i.credsSentAt && !i.loggedInAt) || order.items[0];
              }
              const targetItemId = item?.id;
              if (!targetItemId) {
                return json({ error: "تعذر تحديد عنصر الطلب المستهدف" }, { status: 400 });
              }

              const itemTitle = data.title || item?.title || "الحساب";

              // Cooldown prevention: Check if OTP was sent in the last 4 seconds for this item
              if (item?.verificationCodeSentAt) {
                const diff = Date.now() - new Date(item.verificationCodeSentAt).getTime();
                if (diff < 4000) {
                  return json(
                    {
                      error:
                        "تم إرسال كود التحقق للتو، يرجى الانتظار بضع ثوانٍ قبل إعادة المحاولة",
                    },
                    { status: 429 },
                  );
                }
              }

              const targetThreadId = await resolveThreadId(order, data.threadId);
              if (targetThreadId) {
                await appendMessage(targetThreadId, {
                  senderRole: "admin",
                  senderName: adminName,
                  kind: "item_verification_code",
                  body: {
                    itemId: targetItemId,
                    code,
                    verificationCode: code,
                    title: itemTitle,
                    expiresInMinutes: 10,
                    sentAt: now,
                    text: `🔐 كود التحقق الخاص بـ ${itemTitle}:\n${code}\n\nصالح لمدة 10 دقائق. استخدمه لإكمال تسجيل الدخول.`,
                  },
                });

                const thread = await getThread(targetThreadId);
                if (thread) {
                  await saveThread({
                    ...thread,
                    lastMessageAt: now,
                    lastMessagePreview: `كود التحقق: ${code}`,
                    lastAdminMessageAt: now,
                    mode: "WAITING_FOR_USER",
                    needsAdmin: false,
                  });
                }
              }

              next = patchItem(order, targetItemId, {
                verificationCodeSentAt: now,
                verificationCode: code,
              });

              // Safe audit log & status history in D1
              try {
                const { d1Run, randomId } = await import("@/lib/db.server");
                await d1Run(
                  `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  randomId("aud"),
                  admin.id,
                  "send_verification_code",
                  "order",
                  order.id,
                  JSON.stringify({ itemId: targetItemId, itemTitle, sentAt: now }),
                  now,
                );
                await d1Run(
                  `INSERT INTO order_status_history (id, order_id, status, comment, created_at)
                   VALUES (?, ?, ?, ?, ?)`,
                  randomId("osh"),
                  order.id,
                  order.status,
                  `تم إرسال كود التحقق (OTP) للمنتج: ${itemTitle}`,
                  now,
                );
              } catch {
                // Safe fallback
              }

              // Safe forward to customer Telegram if linked
              try {
                const { d1First } = await import("@/lib/d1.server");
                const link = await d1First<{ telegram_chat_id: number }>(
                  `SELECT telegram_chat_id FROM telegram_links
                   WHERE user_id = ? AND telegram_chat_id IS NOT NULL AND verified = 1
                   ORDER BY linked_at DESC LIMIT 1`,
                  order.userId,
                );
                if (link?.telegram_chat_id) {
                  const { sendTelegramMessage } = await import("@/lib/telegram.server");
                  const otpText = `🔐 *كود التحقق الخاص بطلبك #${order.code}*\n\nالخدمة: ${itemTitle}\nالكود: \`${code}\`\n\nصالح لمدة 10 دقائق. استخدمه لإكمال تسجيل الدخول.`;
                  await sendTelegramMessage(String(link.telegram_chat_id), otpText);
                }
              } catch {
                // Telegram notification failure should not block chat OTP
              }

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
              if (await markAccountRegistered(order.id, data.itemId)) {
                const released = await deliverNextAccount(next, data.itemId, adminName);
                if (released) {
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
              return json({ error: "الإجراء المطلوب غير معروف" }, { status: 400 });
          }

          next = {
            ...next,
            events: [...(next.events || []), { type: data.action ?? "update", at: now }],
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

          return json({ success: true, message: "تمت العملية بنجاح", order: redactOrder(next) });
        }),
    },
  },
});
