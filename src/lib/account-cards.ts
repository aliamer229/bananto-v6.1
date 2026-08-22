/**
 * Normalization for legacy "account delivery" chat cards.
 *
 * Rules (legacy migration spec):
 * - `accountUser` is the primary login identifier. It is NOT necessarily an email,
 *   so the UI label must be "اسم المستخدم" / "Account user".
 * - Password is optional. When absent, the password row must not render at all.
 * - Legacy encrypted values (`enc:v1:...`) are never displayable credentials.
 * - Verification cards render even without an account user.
 */

export type AccountCardType = "credentials" | "verification" | "instructions";

export interface NormalizedAccountCard {
  type: AccountCardType;
  title: string | null;
  accountUser: string | null;
  password: string | null;
  verificationCode: string | null;
  text: string | null;
  images: string[];
  /** true when a legacy ciphertext exists but cannot be shown */
  hasProtectedLegacyPassword: boolean;
  legacyOrderItemId: string | null;
  orderItemResolved: boolean;
}

const PLACEHOLDERS = new Set([
  "",
  "null",
  "undefined",
  "n/a",
  "na",
  "none",
  "-",
  "[protected]",
  "protected",
  "excluded_from_export",
  "غير موجودة",
  "غير متوفر",
]);

export function isEncryptedLegacyValue(value: unknown): boolean {
  return typeof value === "string" && /^enc:v\d+:/i.test(value.trim());
}

export function cleanFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (PLACEHOLDERS.has(str.toLowerCase())) return null;
  if (isEncryptedLegacyValue(str)) return null;
  return str;
}

/** Password that is safe to render to an authorized viewer, or null. */
export function displayablePassword(body: Record<string, unknown>): string | null {
  const storage = String(body["passwordStorage"] ?? "").toLowerCase();
  if (storage.startsWith("encrypted")) return null;
  return cleanFieldValue(body["password"]);
}

export function hasProtectedLegacyPassword(body: Record<string, unknown>): boolean {
  const storage = String(body["passwordStorage"] ?? "").toLowerCase();
  return (
    storage.startsWith("encrypted") ||
    isEncryptedLegacyValue(body["legacyEncryptedPassword"]) ||
    isEncryptedLegacyValue(body["password"])
  );
}

export function accountCardTypeFor(kind: string): AccountCardType | null {
  if (kind === "item_credentials" || kind === "credentials") return "credentials";
  if (kind === "item_verification_code" || kind === "otp" || kind === "verification")
    return "verification";
  if (kind === "instructions") return "instructions";
  if (kind === "card" || kind === "digital_card") return "credentials"; // or verification based on your model
  return null;
}

/** Build a render-safe card from a chat message kind + body. */
export function normalizeAccountCard(
  kind: string,
  rawBody: Record<string, unknown> | null | undefined,
): NormalizedAccountCard | null {
  const type = accountCardTypeFor(kind);
  if (!type) return null;
  const body = rawBody ?? {};

  const accountUser =
    cleanFieldValue(body["accountUser"]) ??
    cleanFieldValue(body["account_user"]) ??
    cleanFieldValue(body["email"]);

  const images = Array.isArray(body["images"])
    ? (body["images"] as unknown[]).map((i) => cleanFieldValue(i)).filter((i): i is string => !!i)
    : [];
  const imageUrl = cleanFieldValue(body["imageUrl"]);
  if (imageUrl && !images.includes(imageUrl)) images.unshift(imageUrl);

  return {
    type,
    title: cleanFieldValue(body["title"]) ?? cleanFieldValue(body["gameName"]),
    accountUser,
    password: type === "credentials" ? displayablePassword(body) : null,
    verificationCode:
      type === "verification"
        ? (cleanFieldValue(body["verificationCode"]) ?? cleanFieldValue(body["code"]))
        : null,
    text: cleanFieldValue(body["text"]) ?? cleanFieldValue(body["instructions"]),
    images,
    hasProtectedLegacyPassword: type === "credentials" && hasProtectedLegacyPassword(body),
    legacyOrderItemId:
      cleanFieldValue(body["legacyOrderItemId"]) ?? cleanFieldValue(body["sourceOrderItemId"]),
    orderItemResolved: body["orderItemResolved"] === true,
  };
}

/** A card is renderable when it carries at least one meaningful field. */
export function isRenderableAccountCard(card: NormalizedAccountCard): boolean {
  if (card.type === "credentials") {
    return Boolean(card.accountUser || card.password);
  }
  if (card.type === "verification") {
    return Boolean(card.verificationCode || card.accountUser || card.title);
  }
  return Boolean(card.text || card.images.length);
}

export interface LegacyDeliveryCardRow {
  legacy_message_id: string;
  legacy_thread_id?: string;
  legacy_user_id?: string;
  card_type: string;
  game_name?: string | null;
  account_user?: string | null;
  password?: string | null;
  password_storage?: string | null;
  legacy_encrypted_password?: string | null;
  verification_code?: string | null;
  text?: string | null;
  images?: string[];
  legacy_order_id?: string | null;
  legacy_order_item_id?: string | null;
  source_order_item_id?: string | null;
  order_item_resolved?: boolean;
  created_at?: string;
}

/**
 * Map a row of `data/account_delivery_cards.jsonl` to the canonical chat message body.
 * The card file is an index/audit view; messages.jsonl stays canonical for rendering,
 * so this mapper is used for verification and enrichment only.
 */
export function deliveryCardToMessageBody(row: LegacyDeliveryCardRow): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: row.game_name ?? undefined,
    accountUser: row.account_user ?? undefined,
    legacyKind: row.card_type,
    orderItemResolved: row.order_item_resolved === true,
  };
  if (row.password) body["password"] = row.password;
  if (row.password_storage) body["passwordStorage"] = row.password_storage;
  if (row.legacy_encrypted_password)
    body["legacyEncryptedPassword"] = row.legacy_encrypted_password;
  if (row.verification_code) body["verificationCode"] = row.verification_code;
  if (row.text) body["text"] = row.text;
  if (row.images?.length) body["images"] = row.images;
  if (row.legacy_order_id) body["legacyOrderId"] = row.legacy_order_id;
  if (row.legacy_order_item_id) body["legacyOrderItemId"] = row.legacy_order_item_id;
  if (row.source_order_item_id) body["sourceOrderItemId"] = row.source_order_item_id;
  return body;
}

/** Deterministic materialization ID for a legacy message/card. */
export function legacyMessageId(legacyMessageId: string): string {
  return `legacy_msg_${legacyMessageId}`;
}

export function accountCardKindOf(cardType: string): string {
  if (cardType === "item_credentials") return "item_credentials";
  if (cardType === "item_verification_code") return "item_verification_code";
  return "instructions";
}
