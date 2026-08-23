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
 * Delivery cards are emitted only by the dedicated orders API. `/api/chat`
 * rejects credential/OTP cards so a free-form message cannot bypass the
 * normalized delivery-item state machine.
 *
 * ## "Last item" means last
 *
 * An order with three games is not finished when the first code goes out.
 * `order_delivery_items` is the single test, and nothing advances until every
 * expected slot has reached `otp_sent`/`completed` and no mapping remains.
 */
import { d1First } from "./d1.server";
import { allExpectedDeliveryItemsDelivered } from "./digital-delivery-state";
import { getDeliveryOrderState, getNextActionableQueuedOrder } from "./order-delivery-items.server";
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
  return getNextActionableQueuedOrder(excludeOrderId, staffId);
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

  /*
   * Chat cards are not delivery state.  The legacy /api/chat path still calls
   * this helper after a message, but a message must never promote an order.
   * Only order_delivery_items (written by the dedicated server actions) can be
   * terminal.  If the normalized flow already made the transition, the branch
   * above handles the idempotent retry; otherwise this is a no-op.
   */
  const state = await getDeliveryOrderState(order);
  if (!allExpectedDeliveryItemsDelivered(state.deliveryItems)) {
    return { finished: false, order };
  }
  console.error("[order-delivery:terminal_rows_without_transition]", {
    orderId: order.id,
    adminId,
    now,
  });
  return { finished: false, order };
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
