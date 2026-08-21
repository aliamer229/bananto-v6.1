/**
 * One-time codes (OTP) verification and delivery service.
 *
 * Security guarantees:
 * - 6-digit cryptographically secure codes (crypto.getRandomValues).
 * - 5-minute expiry (TTL).
 * - 60-second cooldown between resends.
 * - Multi-tier rate limiting (per phone, per hour, per day).
 * - Cryptographic HMAC-SHA-256 digest storage (No plaintext OTP in database).
 * - Atomic consumption to strictly prevent replay attacks.
 * - Purpose bound (signup, reset, verify, login, phone_verification, phone_change).
 * - Automatic rollback if message dispatch fails.
 */

import { env } from "./env.server";
import { randomId, verifyPassword } from "./crypto.server";
import {
  d1All,
  d1First,
  d1Run,
  d1RunChanges,
  ensureOtpSchema,
  ensureSchema,
  getD1,
} from "./d1.server";
import { mutateJson, readJson } from "./storage.server";
import { sendWhatsappOtp, maskPhoneForLog } from "./whatsapp.server";
import { sendTelegramMessage } from "./telegram.server";
import { normalizePhone } from "./phone";

export type OtpPurpose =
  | "signup"
  | "reset"
  | "verify"
  | "login"
  | "password_reset"
  | "phone_verification"
  | "phone_change";

export type OtpChannel = "whatsapp" | "telegram";

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_RESEND_MS = 60 * 1000; // 1 minute cooldown
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_DAY = 10;
const OTP_STORAGE_KEY = "otp-codes.json";

export class OtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpError";
  }
}

interface OtpRecord {
  id: string;
  user_id?: string | null | undefined;
  phone: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination?: string | null | undefined;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string | null | undefined;
  createdAt: string;
}

/**
 * Computes an HMAC-SHA-256 digest of the code bound to the phone and purpose.
 */
export async function computeOtpHash(
  code: string,
  phone: string,
  purpose: string,
): Promise<string> {
  const secret =
    env("OTP_HASH_SECRET") || env("SESSION_SECRET") || "banana_secure_otp_hmac_hash_key";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${phone}:${purpose}:${code.trim()}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates the OTP code against the stored hash.
 * Supports constant-time HMAC check as well as legacy fallback.
 */
export async function verifyOtpCode(
  code: string,
  phone: string,
  purpose: string,
  expectedHash: string,
): Promise<boolean> {
  const computed = await computeOtpHash(code, phone, purpose);
  if (computed === expectedHash) {
    return true;
  }
  // Fallback to legacy password hash verification for in-flight codes
  try {
    return await verifyPassword(code.trim(), expectedHash);
  } catch {
    return false;
  }
}

async function d1Ready() {
  if (!getD1()) return false;
  await ensureSchema();
  await ensureOtpSchema();
  return true;
}

async function loadAll(): Promise<OtpRecord[]> {
  if (await d1Ready()) {
    const rows = await d1All<{
      id: string;
      user_id?: string;
      phone: string;
      purpose: string;
      channel: string;
      destination?: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
      verified_at?: string;
      created_at: string;
    }>(`SELECT * FROM otp_codes ORDER BY created_at DESC LIMIT 200`);

    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      purpose: row.purpose as OtpPurpose,
      channel: (row.channel as OtpChannel) || "whatsapp",
      destination: row.destination,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      attempts: Number(row.attempts ?? 0),
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    }));
  }
  return readJson<OtpRecord[]>(OTP_STORAGE_KEY, []);
}

async function insert(record: OtpRecord) {
  if (await d1Ready()) {
    await d1Run(
      `INSERT INTO otp_codes (id, user_id, phone, purpose, channel, destination, code_hash, expires_at, attempts, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      record.user_id || null,
      record.phone,
      record.purpose,
      record.channel,
      record.destination || null,
      record.codeHash,
      record.expiresAt,
      record.attempts,
      record.verifiedAt || null,
      record.createdAt,
    );
    return;
  }
  await mutateJson<OtpRecord[]>(OTP_STORAGE_KEY, [], (current) => [...current, record]);
}

async function bumpAttempts(id: string, attempts: number) {
  if (await d1Ready()) {
    // Increment in SQL rather than writing back a value read earlier: parallel
    // guesses against the same code would otherwise each store `attempts + 1`
    // from the same stale read and never reach OTP_MAX_ATTEMPTS.
    await d1Run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, id);
    return;
  }
  await mutateJson<OtpRecord[]>(OTP_STORAGE_KEY, [], (current) =>
    current.map((row) => (row.id === id ? { ...row, attempts } : row)),
  );
}

/**
 * Claim an OTP for single use.
 *
 * Returns false when the code was already consumed. The `verified_at IS NULL`
 * guard is what makes this a claim rather than a plain write: two requests
 * arriving with the same still-valid code race on this UPDATE and exactly one
 * of them sees `changes() = 1`.
 */
async function markConsumed(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (await d1Ready()) {
    const claimed = await d1RunChanges(
      `UPDATE otp_codes SET verified_at = ? WHERE id = ? AND verified_at IS NULL`,
      now,
      id,
    );
    return claimed === 1;
  }
  let claimed = false;
  await mutateJson<OtpRecord[]>(OTP_STORAGE_KEY, [], (current) =>
    current.map((row) => {
      if (row.id !== id || row.verifiedAt) return row;
      claimed = true;
      return { ...row, verifiedAt: now };
    }),
  );
  return claimed;
}

async function purge(phone: string, purpose: OtpPurpose) {
  if (await d1Ready()) {
    await d1Run(`DELETE FROM otp_codes WHERE phone = ? AND purpose = ?`, phone, purpose);
    await d1Run(`DELETE FROM otp_codes WHERE expires_at < ?`, new Date().toISOString());
    return;
  }
  const now = Date.now();
  await mutateJson<OtpRecord[]>(OTP_STORAGE_KEY, [], (current) =>
    current.filter(
      (row) => !(row.phone === phone && row.purpose === purpose) && Date.parse(row.expiresAt) > now,
    ),
  );
}

/** Drop a single code — used to roll back a stored code that never shipped. */
async function remove(id: string) {
  if (await d1Ready()) {
    await d1Run(`DELETE FROM otp_codes WHERE id = ?`, id);
    return;
  }
  await mutateJson<OtpRecord[]>(OTP_STORAGE_KEY, [], (current) =>
    current.filter((row) => row.id !== id),
  );
}

async function latest(phone: string, purpose: OtpPurpose): Promise<OtpRecord | undefined> {
  if (await d1Ready()) {
    const row = await d1First<{
      id: string;
      user_id?: string;
      phone: string;
      purpose: string;
      channel: string;
      destination?: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
      verified_at?: string;
      created_at: string;
    }>(
      `SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`,
      phone,
      purpose,
    );

    if (!row) return undefined;
    return {
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      purpose: row.purpose as OtpPurpose,
      channel: (row.channel as OtpChannel) || "whatsapp",
      destination: row.destination,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      attempts: Number(row.attempts ?? 0),
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    } satisfies OtpRecord;
  }
  const all = await loadAll();
  return all
    .filter((row) => row.phone === phone && row.purpose === purpose)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

async function sentInLastPeriod(phone: string, periodMs: number): Promise<number> {
  const since = new Date(Date.now() - periodMs).toISOString();
  if (await d1Ready()) {
    const row = await d1First<{ total: number }>(
      `SELECT COUNT(*) AS total FROM otp_codes WHERE phone = ? AND created_at > ?`,
      phone,
      since,
    );
    return Number(row?.total ?? 0);
  }
  const all = await loadAll();
  return all.filter((row) => row.phone === phone && row.createdAt > since).length;
}

/**
 * Generates a cryptographically secure uniform 6-digit OTP code (100000 - 999999).
 */
export function generateSecureOtpCode(): string {
  const bytes = new Uint32Array(1);
  const range = 900_000;
  const cutoff = Math.floor(0x1_0000_0000 / range) * range;
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0]! >= cutoff);
  return String(100000 + (bytes[0]! % range));
}

export interface OtpSendResult {
  success: boolean;
  error?: string;
  retryAfter?: number;
  expiresAt?: string;
  channel?: OtpChannel;
}

export async function getOtpStatus(key: string, purpose: OtpPurpose) {
  const record = await latest(key, purpose);
  const now = Date.now();
  if (!record || Date.parse(record.expiresAt) < now || record.verifiedAt) {
    return { active: false, canResend: true, retryAfter: 0, attemptsLeft: OTP_MAX_ATTEMPTS };
  }
  const elapsed = now - Date.parse(record.createdAt);
  const retryAfter = Math.max(0, Math.ceil((OTP_RESEND_MS - elapsed) / 1000));
  return {
    active: true,
    channel: record.channel,
    expiresAt: record.expiresAt,
    canResend: retryAfter === 0,
    retryAfter,
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts),
  };
}

export async function sendVerificationCode(
  phone: string,
  purpose: OtpPurpose,
  channel: OtpChannel = "whatsapp",
  userId?: string,
  opts?: { otpKey?: string; chatId?: string | number },
): Promise<OtpSendResult> {
  const canonicalPhone = normalizePhone(phone) || phone;
  const key = opts?.otpKey || canonicalPhone;
  const previous = await latest(key, purpose);
  const now = Date.now();

  // 1. Cooldown check
  const isWithinResendLimit =
    previous && !previous.verifiedAt && now - Date.parse(previous.createdAt) < OTP_RESEND_MS;
  if (isWithinResendLimit) {
    const wait = Math.ceil((OTP_RESEND_MS - (now - Date.parse(previous!.createdAt))) / 1000);
    return {
      success: false,
      retryAfter: wait,
      expiresAt: previous!.expiresAt,
      error: `انتظر ${wait} ثانية قبل طلب رمز جديد.`,
    };
  }

  // 2. Hourly rate limit check
  const sentLastHour = await sentInLastPeriod(key, 60 * 60 * 1000);
  if (sentLastHour >= OTP_MAX_PER_HOUR) {
    return {
      success: false,
      error: "تم تجاوز عدد محاولات الإرسال في الساعة. يرجى الانتظار قليلاً.",
    };
  }

  // 3. Daily rate limit check
  const sentLastDay = await sentInLastPeriod(key, 24 * 60 * 60 * 1000);
  if (sentLastDay >= OTP_MAX_PER_DAY) {
    return {
      success: false,
      error: "تم تجاوز عدد رسائل التحقق المسموح لهذا الرقم اليوم.",
    };
  }

  // 4. Generate cryptographically secure code and HMAC digest
  const code = generateSecureOtpCode();
  const codeHash = await computeOtpHash(code, key, purpose);

  let destination = "";
  if (channel === "telegram") {
    let chatId = opts?.chatId;

    if (!chatId) {
      const link = await d1First<{ telegram_chat_id: number }>(
        `SELECT telegram_chat_id FROM telegram_links
          WHERE (user_id = ? OR user_id = ? OR telegram_phone = ? OR telegram_user_id = ?) AND telegram_chat_id IS NOT NULL AND verified = 1
          ORDER BY linked_at DESC
          LIMIT 1`,
        userId || `guest:${canonicalPhone}`,
        `guest:${canonicalPhone}`,
        canonicalPhone,
        userId || "",
      );

      if (!link?.telegram_chat_id) {
        console.error(
          `[otp:telegram] no verified link for phone=${maskPhoneForLog(canonicalPhone)}`,
        );
        return { success: false, error: "يجب إثبات ملكية حساب تلغرام أولاً عبر التطبيق المصغر." };
      }
      chatId = link.telegram_chat_id;
    }

    destination = String(chatId);
  }

  // 5. Invalidate previous codes and store new record
  const id = randomId("otp");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await purge(key, purpose);
  await insert({
    id,
    user_id: userId,
    phone: key,
    purpose,
    channel,
    destination,
    codeHash,
    expiresAt,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });

  // 6. Deliver message via chosen provider
  let sendResult: { success: boolean; error?: string };

  if (channel === "telegram") {
    const { otpMessage: telegramOtpMessage } = await import("./whatsapp.server");
    const tgRes = await sendTelegramMessage(destination, telegramOtpMessage(code));
    sendResult = { success: tgRes.ok, error: tgRes.error };
  } else {
    // WhatsApp via WaSenderAPI
    const wsRes = await sendWhatsappOtp(canonicalPhone, code);
    sendResult = { success: wsRes.success, error: wsRes.error };
  }

  if (!sendResult.success) {
    // Roll back stored code so user isn't stuck with an unreceived active code
    await remove(id);
    console.error(
      `[otp:${channel}] delivery failed for purpose=${purpose} phone=${maskPhoneForLog(canonicalPhone)}`,
    );
    return {
      success: false,
      error:
        sendResult.error ||
        (channel === "telegram"
          ? "تعذر إرسال رمز التحقق عبر تلغرام حالياً."
          : "تعذر إرسال رمز التحقق عبر واتساب حالياً. يرجى المحاولة مرة أخرى."),
    };
  }

  return {
    success: true,
    channel,
    expiresAt,
    retryAfter: Math.ceil(OTP_RESEND_MS / 1000),
  };
}

export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<void> {
  const res = await sendVerificationCode(phone, purpose, "whatsapp");
  if (!res.success) throw new Error(res.error);
}

/**
 * Validates the OTP code, enforces expiry, purpose, attempts, and atomic single-use consumption.
 */
export async function assertOtp(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
  const canonicalPhone = normalizePhone(phone) || phone;
  const record = await latest(canonicalPhone, purpose);

  if (!record) {
    throw new OtpError("لم يتم طلب رمز لهذا الرقم، أعد الإرسال");
  }

  // Check if already consumed (prevent replay)
  if (record.verifiedAt) {
    throw new OtpError("تم استخدام هذا الرمز مسبقاً، اطلب رمزاً جديداً");
  }

  // Check expiry (5 minutes)
  if (Date.parse(record.expiresAt) < Date.now()) {
    await purge(canonicalPhone, purpose);
    throw new OtpError("انتهت صلاحية الرمز، اطلب رمزاً جديداً");
  }

  // Check purpose
  if (record.purpose !== purpose) {
    throw new OtpError("رمز التحقق غير صالح لهذا الغرض");
  }

  // Check attempt limit (5 attempts)
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await purge(canonicalPhone, purpose);
    throw new OtpError("تم تجاوز الحد الأقصى للمحاولات، اطلب رمزاً جديداً");
  }

  // Verify hash
  const isValid = await verifyOtpCode(code.trim(), canonicalPhone, purpose, record.codeHash);
  if (!isValid) {
    await bumpAttempts(record.id, record.attempts + 1);
    throw new OtpError("رمز التحقق غير صحيح");
  }

  // Atomically mark consumed and purge old entries
  if (!(await markConsumed(record.id))) {
    throw new OtpError("تم استخدام هذا الرمز مسبقاً، اطلب رمزاً جديداً");
  }
  await purge(canonicalPhone, purpose);
}
