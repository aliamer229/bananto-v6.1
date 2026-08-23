/**
 * The state of one thing an admin has to hand over.
 *
 * An order line is not delivered in one step. Somebody types credentials into
 * a form, sends them, waits for the customer to prove they signed in, sends a
 * verification code, and only then is that line finished. Until now the middle
 * of that lived entirely in React state in the delivery modal: a refresh, a
 * closed tab, or an admin picking the order up on another machine lost
 * everything typed so far, and "is this line done?" had to be inferred from a
 * scatter of timestamps on the order item.
 *
 * ## The machine
 *
 * ```
 * draft ──▶ ready ──▶ sent ──▶ proof_received ──▶ otp_sent ──▶ completed
 * ```
 *
 * - **draft** — being typed. Autosaved, never sent.
 * - **ready** — has a username and a password and is attached to an order item.
 * - **sent** — the credentials went to the customer.
 * - **proof_received** — the customer attached their sign-in screenshot.
 * - **otp_sent** — the verification code went out.
 * - **completed** — the customer confirmed, or the order auto-completed.
 *
 * The backend owns the transitions and the UI only renders the state, so two
 * admins on the same order cannot disagree about how far it has got.
 */

export const DELIVERY_ITEM_STATUSES = [
  "draft",
  "ready",
  "sent",
  "proof_received",
  "otp_sent",
  "completed",
] as const;

export type DeliveryItemStatus = (typeof DELIVERY_ITEM_STATUSES)[number];

export const DELIVERY_ITEM_STATUS_LABEL_AR: Record<DeliveryItemStatus, string> = {
  draft: "مسودة",
  ready: "جاهز للإرسال",
  sent: "تم إرسال الحساب",
  proof_received: "وصل إثبات الدخول",
  otp_sent: "تم إرسال كود التحقق",
  completed: "مكتمل",
};

/** How far along the flow each state is, for ordering and comparison. */
const RANK: Record<DeliveryItemStatus, number> = {
  draft: 0,
  ready: 1,
  sent: 2,
  proof_received: 3,
  otp_sent: 4,
  completed: 5,
};

export function normalizeDeliveryStatus(value: unknown): DeliveryItemStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (DELIVERY_ITEM_STATUSES as readonly string[]).includes(raw)
    ? (raw as DeliveryItemStatus)
    : "draft";
}

/** True when `next` is at least as far along as `current`. */
export function isForwardTransition(
  current: DeliveryItemStatus,
  next: DeliveryItemStatus,
): boolean {
  return RANK[next] >= RANK[current];
}

/**
 * The status a row should hold after an event.
 *
 * Monotonic: an event that would move a row backwards is ignored. A duplicate
 * "sent" on a row already at `otp_sent` — a retried request, a double-clicked
 * button — must not undo the code that already went out.
 */
export function advanceDeliveryStatus(
  current: DeliveryItemStatus,
  event: "draft" | "ready" | "sent" | "proof_received" | "otp_sent" | "completed",
): DeliveryItemStatus {
  const next = normalizeDeliveryStatus(event);
  return isForwardTransition(current, next) ? next : current;
}

export interface DeliveryDraftInput {
  itemId?: string | null;
  username?: string | null;
  password?: string | null;
  needsMapping?: boolean;
}

/**
 * Whether a draft is complete enough to send.
 *
 * All three conditions matter: an account with no order item cannot be
 * attributed to a game, and one still marked `needsMapping` is an account the
 * parser could not place — sending it would be a guess.
 */
export function isDraftSendable(draft: DeliveryDraftInput): boolean {
  if (!draft) return false;
  if (draft.needsMapping) return false;
  if (!String(draft.itemId ?? "").trim()) return false;
  if (!String(draft.username ?? "").trim()) return false;
  return Boolean(String(draft.password ?? "").trim());
}

/** The status a freshly saved draft should carry. */
export function draftStatus(draft: DeliveryDraftInput): DeliveryItemStatus {
  return isDraftSendable(draft) ? "ready" : "draft";
}

export interface DeliveryProgress {
  total: number;
  /** Rows that have at least been sent. */
  delivered: number;
  /** Rows finished end to end. */
  completed: number;
  /** Rows still waiting on the admin to type or place something. */
  outstanding: number;
  label: string;
}

/** "تم تجهيز 2 / 4" — what the delivery tool shows above the game ribbon. */
export function summarizeDeliveryProgress(
  rows: readonly { status?: unknown }[] | null | undefined,
  total?: number,
): DeliveryProgress {
  const statuses = (rows ?? []).map((row) => normalizeDeliveryStatus(row?.status));
  const count = total ?? statuses.length;
  const delivered = statuses.filter((status) => RANK[status] >= RANK.sent).length;
  const completed = statuses.filter((status) => status === "completed").length;
  return {
    total: count,
    delivered,
    completed,
    outstanding: Math.max(0, count - delivered),
    label: `تم تجهيز ${delivered} / ${count}`,
  };
}
