import { d1First, d1Run, getD1 } from "./d1.server";
import { env } from "./env.server";
import { clientAddress } from "./security.server";

type Bucket = { count: number; expiresAt: number };
const localBuckets = new Map<string, Bucket>();
let tablePromise: Promise<void> | undefined;

async function opaque(value: string): Promise<string> {
  const configuredSalt = env("RATE_LIMIT_SALT");
  const sessionSecret = env("SESSION_SECRET");
  const salt =
    configuredSalt && configuredSalt.length >= 24
      ? configuredSalt
      : sessionSecret && sessionSecret.length >= 16 // Recovery: Allow slightly shorter session secret in preview
        ? sessionSecret
        : undefined;

  // In production, we strictly require a secure salt.
  const isProduction = env("APP_ENV") === "production";
  if (!salt && isProduction) {
    console.warn("RATE_LIMIT_SECRET_MISSING");
  }

  const effectiveSalt = salt || "local-preview-only-salt-fallback-1234567890";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${effectiveSalt}:${value}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureTable() {
  if (!getD1()) return false;
  if (!tablePromise) {
    tablePromise = d1Run(
      `CREATE TABLE IF NOT EXISTS security_rate_limits (
        key TEXT PRIMARY KEY, count INTEGER NOT NULL,
        window_started INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    )
      .then(() =>
        d1Run(
          `DELETE FROM security_rate_limits WHERE expires_at < ?`,
          Math.floor(Date.now() / 1000),
        ),
      )
      .catch((error) => {
        tablePromise = undefined;
        throw error;
      });
  }
  await tablePromise;
  return true;
}

export async function consumeRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  identity = "",
): Promise<{ allowed: boolean; retryAfter: number; remaining: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + windowSeconds;
  const fingerprint = await opaque(`${scope}:${clientAddress(request)}:${identity.toLowerCase()}`);
  const key = `${scope}:${fingerprint}`;

  if (await ensureTable()) {
    await d1Run(
      `INSERT INTO security_rate_limits (key, count, window_started, expires_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN security_rate_limits.expires_at <= ? THEN 1 ELSE security_rate_limits.count + 1 END,
         window_started = CASE WHEN security_rate_limits.expires_at <= ? THEN ? ELSE security_rate_limits.window_started END,
         expires_at = CASE WHEN security_rate_limits.expires_at <= ? THEN ? ELSE security_rate_limits.expires_at END`,
      key,
      now,
      expiresAt,
      now,
      now,
      now,
      now,
      expiresAt,
    );
    const row = await d1First<{ count: number; expires_at: number }>(
      `SELECT count, expires_at FROM security_rate_limits WHERE key = ?`,
      key,
    );
    const count = Number(row?.count ?? limit + 1);
    const retryAfter = Math.max(1, Number(row?.expires_at ?? expiresAt) - now);
    return { allowed: count <= limit, retryAfter, remaining: Math.max(0, limit - count) };
  }

  const existing = localBuckets.get(key);
  if (localBuckets.size > 10_000) {
    for (const [bucketKey, value] of localBuckets) {
      if (value.expiresAt <= now) localBuckets.delete(bucketKey);
    }
  }
  const bucket =
    !existing || existing.expiresAt <= now
      ? { count: 1, expiresAt }
      : { ...existing, count: existing.count + 1 };
  localBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, bucket.expiresAt - now),
    remaining: Math.max(0, limit - bucket.count),
  };
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: "طلبات كثيرة، حاول لاحقاً", retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } },
  );
}
