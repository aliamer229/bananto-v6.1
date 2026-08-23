/**
 * Repairing a stored chat message into the shape its type promises.
 *
 * ## Why this exists
 *
 * Messages are persisted as a JSON document per row, and documents rot: a
 * truncated write, a body that got encoded twice, a row written by an older
 * version of the app. The store used to read them with
 * `parse(doc, {} as ChatMessage)`, and that cast was a lie — a document that
 * failed to parse became `{}`, whose `body` is `undefined`.
 *
 * That single `undefined` was enough to take the customer's chat down.
 * `redactMessageForMember` does `"support" in message.body`, and `in` on
 * `undefined` throws, so one unreadable row turned the member's entire
 * `GET /api/chat` into a 500 and `/chat` rendered nothing. Staff skip
 * redaction, which is why the admin inbox kept working the whole time and the
 * fault looked like a front-end problem.
 *
 * ## The contract
 *
 * Whatever goes in, what comes out always has:
 *
 * - `body` — a plain object. A body stored double-encoded (a JSON *string*) is
 *   decoded rather than discarded, so its text survives.
 * - `id` — always present, preferring the document's own id, then the database
 *   row's primary key. Two id-less rows must not collide as React keys.
 * - `senderRole` — `"system"` when the stored value is not a role we know.
 *   Never `"user"`: attributing an unreadable row to the customer would show
 *   it as their own message on both surfaces.
 * - `kind` and `createdAt` — never `undefined`.
 *
 * Content is *repaired, not reinterpreted*. `normalizeMessage` in
 * `message-normalizer.ts` is the different, heavier job of deriving a display
 * model (remapping kinds, flattening credential fields); this one only
 * guarantees the shape, so a `digital_order_card` is still a
 * `digital_order_card` when it comes out.
 *
 * Nothing here logs the row's contents — a message body can carry account
 * credentials.
 */
import type { ChatMessage } from "./types";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Reads a message body that may be an object, a JSON string, or nothing. */
export function readMessageBody(raw: unknown): Record<string, unknown> {
  const direct = asObject(raw);
  if (direct) return direct;
  if (typeof raw === "string" && raw.trim()) {
    const decoded = asObject(parseJson(raw));
    // A string that is not JSON is still text somebody sent; keep it readable.
    return decoded ?? { text: raw };
  }
  return {};
}

export interface MessageRowSource {
  /** The stored document: a JSON string, or an already-parsed object. */
  doc: unknown;
  /** The database row's own primary key, used when the document has no id. */
  rowId?: string | null | undefined;
  /** The conversation being read, used when the document does not name one. */
  threadId?: string | undefined;
}

/**
 * Turns one stored or wire-delivered row into a `ChatMessage` that is safe for
 * any caller to read. Never throws.
 */
export function readMessageRow({ doc, rowId, threadId }: MessageRowSource): ChatMessage {
  const parsed = typeof doc === "string" ? parseJson(doc) : doc;
  const row = asObject(parsed) ?? {};

  const rawRole = String(row["senderRole"] ?? "");
  const senderRole: ChatMessage["senderRole"] =
    rawRole === "user" || rawRole === "admin" || rawRole === "system" || rawRole === "assistant"
      ? rawRole
      : "system";

  const docId = typeof row["id"] === "string" ? row["id"].trim() : "";
  const id = docId || (typeof rowId === "string" ? rowId.trim() : "") || "";

  const message: ChatMessage = {
    id: id || `msg_unreadable_${threadId ?? "unknown"}`,
    threadId: typeof row["threadId"] === "string" ? row["threadId"] : (threadId ?? ""),
    senderRole,
    kind: (typeof row["kind"] === "string" && row["kind"]
      ? row["kind"]
      : "text") as ChatMessage["kind"],
    body: readMessageBody(row["body"]),
    createdAt:
      typeof row["createdAt"] === "string" && row["createdAt"]
        ? row["createdAt"]
        : new Date(0).toISOString(),
  };
  if (typeof row["senderName"] === "string") message.senderName = row["senderName"];
  return message;
}

/**
 * True when a repaired row has nothing left to show — no text, no attachment,
 * no card. These are the rows whose document could not be read at all;
 * rendering one puts a blank bubble in the conversation.
 */
export function isEmptyMessage(message: ChatMessage): boolean {
  const body = message.body ?? {};
  if (Object.keys(body).length > 0) return false;
  return message.kind === "text" || !message.kind;
}
