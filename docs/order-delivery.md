# Delivering a digital order

Who owns what, so the same question is never answered in two places.

## The path

```
customer buys
      │
      ▼
order_queue: waiting ──────────────── the admin's list
      │
      ▼
delivery_items (one row per order line)
  draft ─▶ ready ─▶ sent ─▶ proof_received ─▶ otp_sent ─▶ completed
      │
      │  every line sent?
      ▼
order.status = awaiting_customer_confirmation
  order.lastOtpSentAt   = the last delivery
  order.autoCompleteAt  = lastOtpSentAt + 60 minutes
  order_queue row released  ◀── the admin moves to the next order NOW
      │
      ├── customer taps "تم استلام الطلب"  ──▶ completed
      └── 60 minutes pass with nothing open ──▶ completed (auto)
```

The admin's job ends at the release. The customer's confirmation and the
timer are later, separate events, and neither may hold the queue: an
unresponsive customer used to hold up everybody behind them.

## Owners

| Question                                                      | Answered by                                               |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| What is this game called?                                     | `order-item-title.ts`                                     |
| What has been prepared for this line, and how far has it got? | `delivery_items` via `delivery-items.server.ts`           |
| Is this draft allowed to be sent?                             | `delivery-items.ts` (`isDraftSendable`)                   |
| Has the whole order been delivered?                           | `orders.server.ts` (`areAllOrderItemsDelivered`)          |
| What happens when it has?                                     | `order-delivery.server.ts` (`finalizeDeliveryIfComplete`) |
| Which order does the admin pick up next?                      | `order-delivery.server.ts` (`getNextQueuedOrder`)         |
| When does an order finish by itself?                          | `order-completion.ts` (pure)                              |
| Is anything open against this customer?                       | `order-completion.server.ts` (`hasOpenIssue`)             |
| How is an order marked completed?                             | `order-completion.server.ts` (`completeOrder`)            |
| Is this the same product we already sell?                     | `product-identity.ts`                                     |

## Rules that are easy to get wrong

**The game's name comes from `order → order_items → product_id → product.title`
and nowhere else.** Not the conversation subject, not the last message, not a
value the front end cached from another screen, and never a generic stand-in.
When it cannot be resolved, every surface shows `تعذر تحميل بيانات المنتج` and
the ids are logged. A stand-in like "منتج رقمي" is indistinguishable from a
real product with that name.

**An account that could not be matched to a game is not sent.** The Quick Paste
parser is deterministic (`account-paste.ts`, no AI at runtime) and reports
`needs_matching` when it cannot place a line. That stays a failure: the line is
marked `needsMapping`, shown as "بحاجة لتحديد اللعبة", and neither the
per-account send nor "إرسال الكل" will move it until an admin picks the game.
Guessing is how one account gets delivered as all four games on a four-game
order.

**The auto-completion hour runs from the last delivery.** Not from
`deliveryViewedAt` — on a multi-game order the customer opens the card to read
the first account long before the last code goes out, so an order could
complete itself before its final item had been delivered.

**The timer stops while something is open.** An escalated conversation, or one
the automated support handed to a person and nobody has picked up, suspends it.
`hasOpenIssue` fails _open_ on a database error: leaving an order waiting is
safer than auto-completing one with a complaint against it.

**Every transition is monotonic and idempotent.** `advanceDeliveryStatus`
ignores an event that would move a line backwards, so a retried request cannot
undo a code that already went out. `markDeliverySent` keys on `sent_at`, not on
the idempotency key, so a second request for a line that already went out is a
duplicate whatever key it carries. `completeOrder` returns an already-completed
order untouched — one completion card, one rating request, one `completedAt`.

**A degraded order stays visible.** Every read path used to drop an order
failing `validateOrderIntegrity`, so one item with an empty title deleted a
paid order from the admin's queue _and_ the customer's list, silently. Only
reasons that make an order impossible to identify drop it now; anything else is
returned, logged as degraded, and rendered with what is missing shown.

**Nothing logs a credential.** Ids and statuses only. Passwords are encrypted at
rest with `encryptSecretValue`, and an OTP, a password or an account never
reaches a log line.

## The queue

`order_queue` holds orders that still need an admin. A row is released the
moment its order reaches `awaiting_customer_confirmation`, `completed` or
`cancelled`. The schema bootstrap releases rows left behind by older versions —
an `UPDATE`, never a delete.
