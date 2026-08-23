/**
 * When a delivered order finishes by itself.
 *
 * ## The clock
 *
 * The admin's job ends when the last item on the order has been handed over —
 * the last set of credentials, the last verification code. From that instant
 * the customer has an hour to say something; if they do not, the order
 * completes on its own.
 *
 * So the hour runs from **the last delivery**, and from nothing else. The
 * previous implementation preferred `deliveryViewedAt` — the moment the
 * customer opened the delivery card — and only looked at the delivery
 * timestamps when that was absent. On a multi-game order the customer opens
 * the card to read the first account long before the last code goes out, so
 * the hour was already running, and an order could auto-complete before its
 * final item had even been delivered.
 *
 * ## Not while something is open
 *
 * A customer who has raised a problem is not a customer who has gone quiet.
 * The timer is suspended while an issue, an objection or a support ticket is
 * open; {@link isAutoCompleteDue} takes that as an input so the decision stays
 * a pure function of the order and its conversations.
 */

/** The window a customer has to raise something before the order closes itself. */
export const AUTO_COMPLETE_AFTER_MINUTES = 60;

export interface DeliverableItem {
  id?: string | null;
  verificationCodeSentAt?: string | null;
  credsSentAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
}

function time(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The latest moment anything on this order was actually handed to the customer.
 *
 * Returns `null` when nothing has been delivered yet, which is the difference
 * between "the hour has not started" and "the hour started at the epoch".
 */
export function lastDeliveryAt(
  items: readonly DeliverableItem[] | null | undefined,
): string | null {
  let latest: number | null = null;
  for (const item of items ?? []) {
    for (const stamp of [
      item?.verificationCodeSentAt,
      item?.credsSentAt,
      item?.deliveredAt,
      item?.completedAt,
    ]) {
      const ms = time(stamp);
      if (ms !== null && (latest === null || ms > latest)) latest = ms;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

/** When the order will close itself, given when the last item went out. */
export function autoCompleteAt(
  lastDelivery: string | null | undefined,
  minutes: number = AUTO_COMPLETE_AFTER_MINUTES,
): string | null {
  const ms = time(lastDelivery);
  if (ms === null) return null;
  return new Date(ms + minutes * 60_000).toISOString();
}

export interface AutoCompleteInput {
  status: string;
  items: readonly DeliverableItem[];
  /** Set once every item has been delivered. */
  lastOtpSentAt?: string | null;
  autoCompleteAt?: string | null;
  /** True while the customer has an unresolved issue, objection or ticket. */
  hasOpenIssue?: boolean;
}

export type AutoCompleteDecision =
  | { due: true; at: string }
  | {
      due: false;
      reason: "already_final" | "nothing_delivered" | "open_issue" | "waiting";
      /** When it *would* fire, for a "completes in N minutes" line. */
      at?: string | null;
    };

/**
 * Whether an order should close itself now.
 *
 * Pure, so the rule can be tested without a clock or a database: `now` and the
 * open-issue flag are both arguments.
 */
export function isAutoCompleteDue(
  order: AutoCompleteInput,
  now: number = Date.now(),
): AutoCompleteDecision {
  if (order.status === "completed" || order.status === "cancelled") {
    return { due: false, reason: "already_final" };
  }

  const lastDelivery = order.lastOtpSentAt || lastDeliveryAt(order.items);
  if (!lastDelivery) return { due: false, reason: "nothing_delivered" };

  const at = order.autoCompleteAt || autoCompleteAt(lastDelivery);
  if (!at) return { due: false, reason: "nothing_delivered" };

  /*
    Suspended, not cancelled: the deadline is still reported so the admin can
    see when it will resume once the issue is closed.
  */
  if (order.hasOpenIssue) return { due: false, reason: "open_issue", at };

  const dueMs = time(at);
  if (dueMs === null) return { due: false, reason: "nothing_delivered" };
  return now >= dueMs ? { due: true, at } : { due: false, reason: "waiting", at };
}

/** Whole minutes until an order closes itself; 0 once the moment has passed. */
export function minutesUntilAutoComplete(
  at: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const ms = time(at);
  if (ms === null) return null;
  return Math.max(0, Math.ceil((ms - now) / 60_000));
}
