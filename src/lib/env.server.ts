/**
 * Server-side environment helper for Cloudflare Workers and Node.js (local dev).
 * This ensures secrets and bindings are accessed reliably across all server modules.
 */

import { AsyncLocalStorage } from "node:async_hooks";
const cloudflareRuntimeEnv: any = {};

export interface Env {
  [key: string]: unknown;
}

// A Worker isolate can serve overlapping requests. Keeping the active bindings
// only on globalThis lets one request replace another request's environment and,
// with framework-created async contexts, can make non-string bindings such as D1
// disappear. AsyncLocalStorage keeps the bindings scoped to the current request.
const requestEnv = new AsyncLocalStorage<Record<string, unknown>>();

/** Install the current platform bindings. Called at the edge request boundary. */
export function publishEnv(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  requestEnv.enterWith(record);
  // Retain the global fallback for local tooling and older runtimes. Request
  // handlers always prefer the isolated store below.
  (globalThis as { __CF_ENV__?: Record<string, unknown> }).__CF_ENV__ = record;
}

/**
 * Gets the current environment.
 * In Cloudflare Workers, this is injected per-request and stored in globalThis.__CF_ENV__.
 * In Node.js, it falls back to process.env.
 */
export function getEnv(): Env {
  const scopedEnv = requestEnv.getStore();
  if (scopedEnv) {
    return scopedEnv as Env;
  }

  // Cloudflare exposes every secret and platform binding through this built-in
  // module. Prefer it in production so framework adapters cannot accidentally
  // drop non-string bindings (D1/R2/Queues) while forwarding the request —
  // without it the database is simply not there, every session fails to load
  // its user, and the whole site answers 401.
  const runtimeEnv = cloudflareRuntimeEnv as Record<string, unknown>;
  if (runtimeEnv && Object.keys(runtimeEnv).length > 0) {
    return runtimeEnv as Env;
  }

  const cloudflareEnv = (
    globalThis as {
      __CF_ENV__?: Record<string, unknown>;
    }
  ).__CF_ENV__;

  if (cloudflareEnv && typeof cloudflareEnv === "object") {
    return cloudflareEnv as unknown as Env;
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env as unknown as Env;
  }

  return {};
}

/**
 * Reads a specific environment variable or secret.
 */
export function env(name: string): string | undefined {
  const value = getEnv()[name];
  if (typeof value === "string" && value.length > 0) return value;

  // Some runtimes (local dev / preview) expose the platform bindings through
  // `cloudflare:workers` while the project secrets stay on `process.env`.
  // Fall back so secrets are never invisible just because bindings exist.
  if (typeof process !== "undefined" && process.env) {
    const fallback = process.env[name];
    if (typeof fallback === "string" && fallback.length > 0) return fallback;
  }

  return undefined;
}

/**
 * Returns a Cloudflare Binding (D1, R2, Queue).
 */
export function getBinding<T>(name: string): T | undefined {
  return getEnv()[name] as T | undefined;
}

/**
 * Returns true if the current environment is production.
 */
export function isProductionEnvironment(): boolean {
  const e = getEnv();
  // Standard Cloudflare Worker APP_ENV or existence of production-only keys.
  // We avoid process.env in production check as it's unreliable in Workers.
  if (e["APP_ENV"] === "production") return true;

  // Sandbox preview detection
  if (typeof process !== "undefined" && process.env["VITE_PREVIEW"]) return false;

  return false;
}

/**
 * Safe diagnostics for environment configuration.
 * Returns only boolean status, never the actual secret values.
 */
export function getNotificationConfigStatus() {
  const e = getEnv();
  const isProd = isProductionEnvironment();

  const hasValue = (key: string, minLength = 6) => {
    const val = e[key];
    return typeof val === "string" && val.length >= minLength;
  };

  return {
    sessionSigningConfigured: hasValue("SESSION_SECRET", 16),
    accountEncryptionConfigured: hasValue("ACCOUNT_ENC_KEY", 32),
    telegramTokenConfigured: hasValue("TELEGRAM_BOT_TOKEN"),
    telegramWebhookSecretConfigured:
      hasValue("TELEGRAM_WEBHOOK_SECRET", 16) &&
      typeof e["TELEGRAM_WEBHOOK_SECRET"] === "string" &&
      /^[A-Za-z0-9_-]{16,256}$/.test(e["TELEGRAM_WEBHOOK_SECRET"]),
    wasenderApiKeyConfigured: hasValue("WASENDER_API_KEY", 8),
    otpHashSecretConfigured: hasValue("OTP_HASH_SECRET", 16) || hasValue("SESSION_SECRET", 16),
    googleConfigured: hasValue("GOOGLE_CLIENT_ID") && hasValue("GOOGLE_CLIENT_SECRET"),
    appleConfigured: hasValue("APPLE_CLIENT_ID") && hasValue("APPLE_PRIVATE_KEY"),
    ownerEmailConfigured: hasValue("OWNER_EMAILS", 3),
    ownerPhoneConfigured: hasValue("OWNER_PHONES", 8),
    queueConfigured:
      !!e["NOTIFICATIONS_QUEUE"] && typeof (e["NOTIFICATIONS_QUEUE"] as any).send === "function",
    isProduction: isProd,
  };
}
