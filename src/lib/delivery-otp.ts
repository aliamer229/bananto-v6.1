/**
 * Validity of a delivery verification code.
 *
 * The code an admin sends during handover is the customer's login/2FA code, and
 * it used to be nothing but text in a chat bubble labelled "صالح لمدة 10 دقيقة".
 * That label was a constant, not a fact: it never counted down, it said the same
 * thing an hour later, and a page refresh re-rendered it unchanged. Meanwhile
 * three places disagreed about the number — the sender wrote 60, the admin card
 * defaulted to 10, and nothing anywhere compared it against the clock.
 *
 * So the lifetime is fixed here, once, and the *absolute* expiry instant is
 * stamped by the server and carried on the message. Every surface derives what
 * it shows from that instant, which is what makes a refresh show the real
 * remaining time instead of restarting a local timer.
 */

/** How long a delivery verification code stays valid. */
export const DELIVERY_OTP_TTL_MINUTES = 60;
export const DELIVERY_OTP_TTL_MS = DELIVERY_OTP_TTL_MINUTES * 60 * 1000;

/** The server's answer to "when does this code die", from when it was created. */
export function deliveryOtpExpiry(createdAt: string | number | Date = Date.now()): string {
  const base =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === "number"
        ? createdAt
        : Date.parse(createdAt);
  const start = Number.isFinite(base) ? base : Date.now();
  return new Date(start + DELIVERY_OTP_TTL_MS).toISOString();
}

export interface CodeValidity {
  /** False once the expiry instant has passed. */
  valid: boolean;
  /** Milliseconds left, floored at 0. */
  remainingMs: number;
  /** Whole minutes left, rounded up so "1 دقيقة" covers the final seconds. */
  remainingMinutes: number;
  /** Arabic label for the card. */
  label: string;
  /** True when there is no usable expiry instant to judge against. */
  unknown: boolean;
}

/**
 * What a card should say about a code right now.
 *
 * `expiresAt` is the server-stamped instant. When it is missing — an older
 * message sent before codes carried one — the result is `unknown` and callers
 * fall back to stating the lifetime rather than claiming a countdown they
 * cannot compute.
 */
export function describeCodeValidity(
  expiresAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): CodeValidity {
  if (expiresAt === null || expiresAt === undefined || expiresAt === "") {
    return {
      valid: true,
      remainingMs: 0,
      remainingMinutes: 0,
      label: `صالح لمدة ${DELIVERY_OTP_TTL_MINUTES} دقيقة`,
      unknown: true,
    };
  }

  const at =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "number"
        ? expiresAt
        : Date.parse(String(expiresAt));

  if (!Number.isFinite(at)) {
    return {
      valid: true,
      remainingMs: 0,
      remainingMinutes: 0,
      label: `صالح لمدة ${DELIVERY_OTP_TTL_MINUTES} دقيقة`,
      unknown: true,
    };
  }

  const remainingMs = at - now;
  if (remainingMs <= 0) {
    return {
      valid: false,
      remainingMs: 0,
      remainingMinutes: 0,
      label: "انتهت صلاحية الكود",
      unknown: false,
    };
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes >= 60) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return {
      valid: true,
      remainingMs,
      remainingMinutes,
      label: minutes > 0 ? `صالح ${hours} ساعة و ${minutes} دقيقة` : `صالح ${hours} ساعة`,
      unknown: false,
    };
  }

  return {
    valid: true,
    remainingMs,
    remainingMinutes,
    label: `صالح ${remainingMinutes} دقيقة`,
    unknown: false,
  };
}

/**
 * Server-side gate: is this code still usable?
 *
 * Kept separate from {@link describeCodeValidity} so a caller that needs a
 * yes/no answer cannot accidentally depend on how the label is worded.
 */
export function isDeliveryOtpUsable(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return true; // pre-expiry-stamp message; nothing to enforce
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? at > now : true;
}
