/**
 * Telegram ownership proof.
 *
 * A Telegram chat id is NEVER accepted from the browser. The only way an
 * account becomes linked is the proof-of-ownership flow:
 *
 * 1. Verification Session: Mini App + Contact Share (for OTP/Signup)
 * 2. Deep Link: /start TOKEN (Legacy/Simple linking)
 */

import { d1All, d1First, d1Run, d1RunChanges, ensureTelegramSchema, getD1 } from "./d1.server";
import { telegramBotStartDeepLink } from "./telegram.server";
import { normalizePhone, arePhonesEqual } from "./phone";

const TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

export interface LinkToken {
  token: string;
  user_id: string;
  status: string;
  telegram_chat_id: number | null;
  expires_at: string;
}

export interface VerificationSession {
  id: string;
  owner_key: string;
  phone: string;
  status: "pending" | "verified" | "failed" | "expired";
  telegram_user_id: string | null;
  telegram_chat_id: number | null;
  telegram_phone: string | null;
  attempts: number;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  token: string;
}

export type VerificationSessionStatus =
  "pending" | "contact_required" | "verified" | "failed" | "expired" | "unknown";

function randomToken(len = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Legacy/Deep-link Token Creation */
export async function createLinkToken(ownerKey: string): Promise<{
  token: string;
  deepLink: string;
  expiresAt: string;
}> {
  await ensureTelegramSchema();
  const now = Date.now();
  const token = randomToken(16);
  const expiresAt = new Date(now + TTL_MS).toISOString();

  await d1Run(`DELETE FROM telegram_link_tokens WHERE expires_at < ?`, new Date(now).toISOString());
  await d1Run(
    `DELETE FROM telegram_link_tokens WHERE user_id = ? AND status = 'pending'`,
    ownerKey,
  );
  const inserted = await d1RunChanges(
    `INSERT INTO telegram_link_tokens (token, user_id, status, expires_at, created_at)
     VALUES (?, ?, 'pending', ?, ?)`,
    token,
    ownerKey,
    expiresAt,
    new Date(now).toISOString(),
  );
  if (inserted !== 1) throw new Error("TELEGRAM_LINK_TOKEN_NOT_PERSISTED");

  return {
    token,
    deepLink: telegramBotStartDeepLink(token),
    expiresAt,
  };
}

export async function readLinkToken(token: string): Promise<LinkToken | undefined> {
  if (!token || !/^[A-Za-z0-9_-]{8,80}$/.test(token)) return undefined;
  return d1First<LinkToken>(
    `SELECT token, user_id, status, telegram_chat_id, expires_at FROM telegram_link_tokens WHERE token = ?`,
    token,
  );
}

export async function linkTokenStatus(token: string): Promise<{
  status: "pending" | "used" | "expired" | "unknown";
}> {
  const row = await readLinkToken(token);
  if (!row) return { status: "unknown" };
  if (row.status === "used") return { status: "used" };
  if (Date.parse(row.expires_at) < Date.now()) return { status: "expired" };
  return { status: "pending" };
}

/** Verified chat id for an owner key, or undefined when ownership is unproven. */

export async function verifiedChatId(
  ownerKey: string,
  phone?: string,
): Promise<number | undefined> {
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  const row = await d1First<{ telegram_chat_id: number }>(
    `SELECT telegram_chat_id FROM telegram_links 
     WHERE (user_id = ? ${normalizedPhone ? "OR telegram_phone = ?" : ""}) 
       AND verified = 1 AND telegram_chat_id IS NOT NULL
     LIMIT 1`,
    ownerKey,
    ...(normalizedPhone ? [normalizedPhone] : []),
  );
  return row?.telegram_chat_id ?? undefined;
}

/**
 * Creates a verification session for the Telegram ownership flow.
 */
export async function createVerificationSession(
  ownerKey: string,
  phone: string,
): Promise<VerificationSession & { deepLink: string }> {
  const db = getD1();
  if (!db) {
    throw new Error("TELEGRAM_VERIFICATION_STORAGE_UNAVAILABLE");
  }

  await ensureTelegramSchema();

  const normalizedPhone = normalizePhone(phone);
  if (!ownerKey || ownerKey.length > 160 || !normalizedPhone) {
    throw new Error("TELEGRAM_VERIFICATION_INPUT_INVALID");
  }

  const now = new Date();

  // Retrying the website form must not kill the link the bot already delivered.
  // Expiring the live challenge and minting a new one meant the message sitting
  // in the user's Telegram chat opened the Mini App on a dead session — the
  // "verification session expired" dead end. The same owner proving the same
  // number is the same challenge, so hand back the live one.
  //
  // Only an *unclaimed* challenge is reusable. Anonymous signups share the owner
  // key `guest:<phone>`, so handing back a challenge some Telegram account has
  // already bound itself to would let one caller inherit — or invalidate —
  // another's in-flight proof.
  const live = await d1First<VerificationSession>(
    `SELECT * FROM telegram_verification_sessions
      WHERE owner_key = ? AND phone = ? AND status = 'pending' AND expires_at > ?
        AND telegram_user_id IS NULL AND telegram_chat_id IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    ownerKey,
    normalizedPhone,
    now.toISOString(),
  );
  if (live?.token) {
    return { ...live, deepLink: telegramBotStartDeepLink(live.token) };
  }

  const id = crypto.randomUUID();
  const token = randomToken(24);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session: VerificationSession = {
    id,
    owner_key: ownerKey,
    phone: normalizedPhone,
    status: "pending",
    telegram_user_id: null,
    telegram_chat_id: null,
    telegram_phone: null,
    attempts: 0,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    verified_at: null,
    token,
  };

  // A user can have only one live ownership challenge. This prevents an old
  // contact-share event from verifying a newer/different phone by accident.
  await d1Run(
    `UPDATE telegram_verification_sessions
        SET status = 'expired'
      WHERE owner_key = ? AND status = 'pending'`,
    ownerKey,
  );
  await d1Run(`DELETE FROM telegram_verification_sessions WHERE expires_at < ?`, now.toISOString());

  const inserted = await d1RunChanges(
    `INSERT INTO telegram_verification_sessions (id, owner_key, phone, status, created_at, expires_at, token)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    session.owner_key,
    session.phone,
    session.status,
    session.created_at,
    session.expires_at,
    session.token,
  );
  if (inserted !== 1) throw new Error("TELEGRAM_VERIFICATION_SESSION_NOT_PERSISTED");

  // d1Run intentionally tolerates an unavailable REST binding elsewhere in
  // the app. Verification cannot do that: returning an unpersisted session
  // creates a link that is guaranteed to become "unknown" on the next request.
  const persisted = await getVerificationSession(id);
  if (!persisted) {
    throw new Error("TELEGRAM_VERIFICATION_SESSION_NOT_PERSISTED");
  }

  return {
    ...session,
    // `/start` is delivered consistently on Android/iOS. The bot then offers
    // both an explicit Web App URL and a direct contact-share fallback.
    deepLink: telegramBotStartDeepLink(token),
  };
}

export async function getVerificationSession(id: string): Promise<VerificationSession | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return undefined;
  }
  return d1First<VerificationSession>(
    `SELECT * FROM telegram_verification_sessions WHERE id = ?`,
    id,
  );
}

export async function getVerificationSessionByToken(
  token: string,
): Promise<VerificationSession | undefined> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return undefined;
  return d1First<VerificationSession>(
    `SELECT * FROM telegram_verification_sessions WHERE token = ?`,
    token,
  );
}

/** Resolve either the private database id used by the website or launch token. */
export async function getVerificationSessionByReference(
  reference: string,
): Promise<VerificationSession | undefined> {
  if (!reference || !/^[A-Za-z0-9_-]{8,128}$/.test(reference)) return undefined;
  const byId = await getVerificationSession(reference);
  return byId ?? getVerificationSessionByToken(reference);
}

/**
 * Bind a verification session to the Telegram user from authenticated
 * Mini-App initData. In a private bot chat Telegram's user id is also the
 * chat id; both values therefore come from signed Telegram data, never from
 * an untrusted browser field.
 */
export async function bindMiniAppIdentity(
  reference: string,
  telegramUserId: string,
): Promise<{ status: VerificationSessionStatus; session?: VerificationSession }> {
  const session = await getVerificationSessionByReference(reference);
  if (!session) return { status: "unknown" };

  if (Date.parse(session.expires_at) < Date.now()) {
    await d1Run(
      `UPDATE telegram_verification_sessions SET status = 'expired' WHERE id = ?`,
      session.id,
    );
    return { status: "expired", session: { ...session, status: "expired" } };
  }

  if (
    session.status === "verified" ||
    session.status === "failed" ||
    session.status === "expired"
  ) {
    return { status: session.status, session };
  }

  if (session.telegram_user_id && session.telegram_user_id !== telegramUserId) {
    return { status: "failed" };
  }

  const telegramChatId = Number(telegramUserId);
  if (!Number.isSafeInteger(telegramChatId) || telegramChatId <= 0) {
    return { status: "failed" };
  }

  const changed = await d1RunChanges(
    `UPDATE telegram_verification_sessions
       SET telegram_user_id = ?, telegram_chat_id = ?
     WHERE id = ? AND status = 'pending'
       AND (telegram_user_id IS NULL OR telegram_user_id = ?)`,
    telegramUserId,
    telegramChatId,
    session.id,
    telegramUserId,
  );
  if (changed !== 1) return { status: "failed" };

  return {
    status: "contact_required",
    session: { ...session, telegram_user_id: telegramUserId, telegram_chat_id: telegramChatId },
  };
}

export async function verificationSessionStatus(reference: string): Promise<{
  status: VerificationSessionStatus;
  verifiedAt?: string | null;
}> {
  const session = await getVerificationSessionByReference(reference);
  if (!session) return { status: "unknown" };
  if (Date.parse(session.expires_at) < Date.now()) {
    await d1Run(
      `UPDATE telegram_verification_sessions SET status = 'expired' WHERE id = ?`,
      session.id,
    );
    return { status: "expired" };
  }
  return {
    status:
      session.status === "pending" && session.telegram_user_id
        ? "contact_required"
        : session.status,
    verifiedAt: session.verified_at,
  };
}

/** Updates session with Telegram identity. Called from /start TOKEN handler. */
export async function bindSessionChat(
  token: string,
  telegramUserId: string,
  telegramChatId: number,
) {
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(token) ||
    !/^\d{1,20}$/.test(telegramUserId) ||
    !Number.isSafeInteger(telegramChatId) ||
    telegramChatId <= 0 ||
    String(telegramChatId) !== telegramUserId
  )
    return null;
  const session = await getVerificationSessionByToken(token);
  if (!session || session.status !== "pending") return null;

  if (Date.parse(session.expires_at) < Date.now()) {
    await d1Run(
      `UPDATE telegram_verification_sessions SET status = 'expired' WHERE id = ?`,
      session.id,
    );
    return null;
  }

  const changed = await d1RunChanges(
    `UPDATE telegram_verification_sessions 
     SET telegram_user_id = ?, telegram_chat_id = ?
     WHERE id = ? AND status = 'pending'`,
    telegramUserId,
    telegramChatId,
    session.id,
  );
  return changed === 1 ? session : null;
}

/** Matches shared contact with session and updates status. */
export async function processVerificationContact(
  telegramUserId: string,
  telegramChatId: number,
  telegramPhone: string,
) {
  await ensureTelegramSchema();
  const normalizedTgPhone = normalizePhone(telegramPhone);
  if (!normalizedTgPhone) return null;

  const now = new Date().toISOString();

  // Find active pending sessions
  const pendingSessions = await d1All<VerificationSession>(
    `SELECT * FROM telegram_verification_sessions
     WHERE status = 'pending' AND expires_at > ?
     ORDER BY created_at DESC LIMIT 25`,
    now,
  );

  if (!pendingSessions || pendingSessions.length === 0) {
    return null;
  }

  // 1. First priority: Pending session that matches this phone AND is already bound to this chat/user
  let session = pendingSessions.find(
    (s) =>
      arePhonesEqual(s.phone, telegramPhone) &&
      (s.telegram_chat_id === telegramChatId || s.telegram_user_id === telegramUserId),
  );

  // 2. Second priority: Any pending session matching this phone (unbound or newly created)
  if (!session) {
    session = pendingSessions.find((s) => arePhonesEqual(s.phone, telegramPhone));
  }

  // 3. Third priority: Pending session bound to this chat/user (even if phone was formatted differently)
  if (!session) {
    session = pendingSessions.find(
      (s) => s.telegram_chat_id === telegramChatId || s.telegram_user_id === telegramUserId,
    );
  }

  if (!session) return null;

  const matches = arePhonesEqual(session.phone, telegramPhone);
  const newAttempts = (session.attempts || 0) + 1;

  if (!matches) {
    await d1Run(
      `UPDATE telegram_verification_sessions
         SET status = 'failed', telegram_phone = ?, attempts = ?, verified_at = NULL
       WHERE id = ?`,
      normalizedTgPhone,
      newAttempts,
      session.id,
    );
    return { matches: false, sessionId: session.id, status: "failed" };
  }

  // Clear all conflicting links for this Telegram identity or target owner_key before binding
  await d1Run(
    `DELETE FROM telegram_links
      WHERE telegram_user_id = ? OR telegram_chat_id = ? OR user_id = ?`,
    telegramUserId,
    telegramChatId,
    session.owner_key,
  );

  const stamp = now;
  await d1Run(
    `INSERT INTO telegram_links (user_id, telegram_chat_id, telegram_user_id, telegram_phone, verified, linked_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       telegram_chat_id = excluded.telegram_chat_id,
       telegram_user_id = excluded.telegram_user_id,
       telegram_phone = excluded.telegram_phone,
       verified = 1,
       updated_at = excluded.updated_at`,
    session.owner_key,
    telegramChatId,
    telegramUserId,
    normalizedTgPhone,
    stamp,
    stamp,
  );

  await d1Run(
    `UPDATE telegram_verification_sessions
       SET status = 'verified', telegram_phone = ?, telegram_chat_id = ?, telegram_user_id = ?, attempts = ?, verified_at = ?
     WHERE id = ?`,
    normalizedTgPhone,
    telegramChatId,
    telegramUserId,
    newAttempts,
    now,
    session.id,
  );

  return { matches: true, sessionId: session.id, status: "verified" };
}

export async function adoptGuestTelegramLink(phone: string, userId: string): Promise<void> {
  try {
    await ensureTelegramSchema();
    const guestKey = `guest:${phone}`;
    let guest = await d1First<{
      telegram_chat_id: number;
      telegram_user_id: string | null;
      telegram_username: string | null;
      telegram_phone: string | null;
    }>(
      `SELECT telegram_chat_id, telegram_user_id, telegram_username, telegram_phone FROM telegram_links
       WHERE user_id = ? OR user_id = ? OR telegram_phone = ?
       ORDER BY linked_at DESC LIMIT 1`,
      guestKey,
      userId,
      phone,
    );

    if (!guest?.telegram_chat_id) {
      const verifiedSession = await d1First<{
        telegram_chat_id: number;
        telegram_user_id: string | null;
        telegram_phone: string | null;
      }>(
        `SELECT telegram_chat_id, telegram_user_id, telegram_phone FROM telegram_verification_sessions
         WHERE (owner_key = ? OR owner_key = ? OR phone = ?) AND status = 'verified' AND telegram_chat_id IS NOT NULL
         ORDER BY verified_at DESC LIMIT 1`,
        guestKey,
        userId,
        phone,
      );
      if (verifiedSession?.telegram_chat_id) {
        guest = {
          telegram_chat_id: verifiedSession.telegram_chat_id,
          telegram_user_id: verifiedSession.telegram_user_id,
          telegram_username: null,
          telegram_phone: verifiedSession.telegram_phone || phone,
        };
      }
    }

    if (!guest?.telegram_chat_id) return;

    const stamp = new Date().toISOString();
    await d1Run(
      `DELETE FROM telegram_links WHERE user_id = ? OR user_id = ? OR telegram_chat_id = ?`,
      userId,
      guestKey,
      guest.telegram_chat_id,
    );
    await d1Run(
      `INSERT INTO telegram_links (user_id, telegram_chat_id, telegram_user_id, telegram_username, telegram_phone, verified, linked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      userId,
      guest.telegram_chat_id,
      guest.telegram_user_id,
      guest.telegram_username,
      guest.telegram_phone || phone,
      stamp,
      stamp,
    );
    await d1Run(`UPDATE telegram_link_tokens SET user_id = ? WHERE user_id = ?`, userId, guestKey);
    await d1Run(
      `UPDATE telegram_verification_sessions SET owner_key = ? WHERE owner_key = ?`,
      userId,
      guestKey,
    );

    try {
      const { assignTelegramMemberNo } = await import("./member-id.server");
      await assignTelegramMemberNo(userId, guest.telegram_chat_id);
    } catch (err) {
      console.error("[telegram:error] member id derivation failed:", (err as Error).message);
    }
  } catch (err) {
    console.error("[telegram:adopt] error adopting telegram link:", (err as Error).message);
  }
}
