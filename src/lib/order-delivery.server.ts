/**
 * What happens when the last thing an order needs has been handed over.
 *
 * ## The rule
 *
 * The admin's job on a digital order ends when the final delivery item is sent
 * — the last set of credentials, the last verification code. At that instant:
 *
 * - the order moves to `awaiting_customer_confirmation`,
 * - it leaves the preparation queue, so everyone's queue position advances,
 * - the admin is handed the next order in the queue.
 *
 * The customer pressing "تم استلام الطلب" (or the auto-completion timer) is a
 * separate, later event that takes the order to `completed`. It must never gate
 * the admin or the queue — an unresponsive customer used to hold up everybody
 * behind them.
 *
 * ## Why this module exists
 *
 * There are two ways an admin sends a delivery item: the dedicated
 * `send_verification_code` action on the orders API, and an ordinary chat
 * message carrying an `item_verification_code` / `item_credentials` card
 * through `/api/chat` (which is what the account-tools modal actually uses).
 * Only the first knew how to finish an order, so finishing depended on which
 * button the admin happened to press. Both call in here now.
 *
 * ## "Last item" means last
 *
 * An order with three games is not finished when the first code goes out.
 * {@link areAllOrderItemsDelivered} is the single test, and nothing advances
 * until it is true.
 */
import { d1All, d1First, d1Run } from "./d1.server";
import { getOrder, saveOrder } from "./db.server";
import { areAllOrderItemsDelivered } from "./orders.server";
import { randomId } from "./crypto.server";
import { withDeliveryDeadline } from "./order-completion.server";
import type { Order } from "./types";

export interface NextQueuedOrder {
  orderId: string;
  threadId?: string | undefined;
  code?: string | undefined;
  userName?: string | undefined;
}

export interface DeliveryCompletion {
  /** True when this delivery was the one that finished the order. */
  finished: boolean;
  /** The order after any transition. */
  order: Order;
  /** Where the admin should go next, when the order finished. */
  next?: NextQueuedOrder | undefined;
}

/**
 * The next order the admin should pick up, in real queue order.
 *
 * Reads `order_queue` rather than whatever list the client happens to be
 * holding, so two admins working the same queue see a consistent answer and the
 * order is genuinely the oldest waiting one — the previous client-side version
 * picked whichever thread happened to sort first in memory.
 */
export async function getNextQueuedOrder(
  excludeOrderId?: string,
  staffId?: string,
): Promise<NextQueuedOrder | undefined> {
  const rows = await d1All<{ order_id: string; assigned_staff_id: string | null }>(
    `SELECT order_id, assigned_staff_id FROM order_queue
     WHERE status IN ('waiting', 'processing')
     ORDER BY created_at ASC
     LIMIT 25`,
  );

  for (const row of rows) {
    if (excludeOrderId && row.order_id === excludeOrderId) continue;
    // Do not steal a task another admin is already holding.
    if (row.assigned_staff_id && staffId && row.assigned_staff_id !== staffId) continue;

    const order = await getOrder(row.order_id);
    if (!order) continue;
    if (order.status === "completed" || order.status === "cancelled") continue;
    if (order.status === "awaiting_customer_confirmation") continue;
    if (areAllOrderItemsDelivered(order)) continue;

    return {
      orderId: order.id,
      threadId: order.threadId,
      code: order.code,
      userName: order.userName,
    };
  }
  return undefined;
}

/**
 * Applies the end-of-delivery transition when — and only when — every item on
 * the order has been handed over.
 *
 * Safe to call after any delivery action; it is a no-op while items remain, and
 * idempotent once the order has already moved on.
 */
export async function finalizeDeliveryIfComplete(
  order: Order,
  adminId: string,
  now: string = new Date().toISOString(),
): Promise<DeliveryCompletion> {
  if (order.status === "completed" || order.status === "cancelled") {
    return { finished: false, order };
  }

  // Already finished by an earlier call — still report where to go next, so a
  // retried request does not leave the admin stranded on a finished order.
  if (order.status === "awaiting_customer_confirmation") {
    return {
      finished: true,
      order,
      next: await getNextQueuedOrder(order.id, adminId),
    };
  }

  if (!areAllOrderItemsDelivered(order)) {
    return { finished: false, order };
  }

  /*
    Stamp when the last item actually went out and when the order will close
    itself. Storing both makes the state legible — the customer's screen can
    say "completes in N minutes", and the auto-completion pass does not have to
    re-derive the clock from item timestamps on every read.
  */
  const next: Order = withDeliveryDeadline(
    {
      ...order,
      status: "awaiting_customer_confirmation",
      updatedAt: now,
      events: [
        ...(order.events ?? []),
        { type: "delivery_completed", at: now, payload: { by: adminId } },
      ],
    },
    now,
  );

  await saveOrder(next);

  // Leave the preparation queue. Everyone behind this order moves up.
  try {
    await d1Run(
      `UPDATE order_queue SET status = 'completed', updated_at = ? WHERE order_id = ?`,
      now,
      order.id,
    );
  } catch (err) {
    console.warn("[order-delivery:queue_release_failed]", err);
  }

  try {
    await d1Run(
      `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
       VALUES (?, ?, ?, 'awaiting_customer_confirmation', ?, 'اكتمل تسليم جميع عناصر الطلب، بانتظار تأكيد العميل', ?)`,
      randomId("osh"),
      order.id,
      order.status,
      adminId,
      now,
    );
  } catch (err) {
    console.warn("[order-delivery:history_failed]", err);
  }

  return {
    finished: true,
    order: next,
    next: await getNextQueuedOrder(order.id, adminId),
  };
}

/**
 * Live queue position for an order, 1-based.
 *
 * Returns 0 for an order that is no longer queued, which is what the customer's
 * "your turn is N" line should treat as "being handled / done".
 */
export async function getQueuePosition(orderId: string): Promise<number> {
  const row = await d1First<{ position: number }>(
    `SELECT COUNT(*) + 1 AS position FROM order_queue
     WHERE status = 'waiting'
       AND created_at < (SELECT created_at FROM order_queue WHERE order_id = ?)`,
    orderId,
  );
  const self = await d1First<{ status: string }>(
    `SELECT status FROM order_queue WHERE order_id = ?`,
    orderId,
  );
  if (!self || self.status === "completed") return 0;
  return Number(row?.position ?? 0);
}
