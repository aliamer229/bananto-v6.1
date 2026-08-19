/**
 * Deterministic member numbers derived from a Telegram chat id.
 *
 * member_id = truncate(HMAC-SHA256(TELEGRAM_MEMBER_ID_SECRET, chat_id))
 *
 * The derivation is one-way: the chat id can never be recovered from the
 * member number, and the chat id itself is never shown to the user.
 * Collisions are resolved by re-hashing with a counter, so a member number is
 * never handed to the wrong account.
 */

import { d1First, d1Run } from "./d1.server";
import { env } from "./env.server";

const DIGITS = 6;
const MODULO = 10 ** DIGITS;
const OFFSET = 100000; // keeps the number a stable 6-digit value

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function toNumber(bytes: Uint8Array): number {
  // 6 bytes stays inside the safe-integer range.
  let value = 0;
  for (let i = 0; i < 6; i += 1) value = value * 256 + bytes[i]!;
  return value;
}

/** Deterministic candidate member number for a chat id (attempt 0 = primary). */
export async function deriveMemberId(chatId: string | number, attempt = 0): Promise<string> {
  const secret = env("TELEGRAM_MEMBER_ID_SECRET");
  if (!secret) throw new Error("TELEGRAM_MEMBER_ID_SECRET_MISSING");
  const digest = await hmacSha256(secret, attempt === 0 ? String(chatId) : `${chatId}#${attempt}`);
  const value = OFFSET + (toNumber(digest) % (MODULO - OFFSET));
  return String(value);
}

/**
 * Assigns a deterministic member number to the account linked to `chatId`.
 * Existing member numbers are never overwritten, and a collision with another
 * account moves to the next deterministic candidate instead of stealing it.
 */
export async function assignTelegramMemberNo(
  userId: string,
  chatId: string | number,
): Promise<string | null> {
  const current = await d1First<{ member_no: string | null }>(
    `SELECT member_no FROM users WHERE id = ?`,
    userId,
  );
  if (current?.member_no) return current.member_no;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = await deriveMemberId(chatId, attempt);
    const taken = await d1First<{ id: string }>(
      `SELECT id FROM users WHERE member_no = ?`,
      candidate,
    );
    if (taken && taken.id !== userId) continue;
    try {
      await d1Run(`UPDATE users SET member_no = ? WHERE id = ?`, candidate, userId);
      return candidate;
    } catch {
      // Unique-index race: try the next deterministic candidate.
    }
  }
  console.error("[member-id] derivation exhausted without a free candidate");
  return null;
}
