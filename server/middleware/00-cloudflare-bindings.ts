import { defineMiddleware } from "nitro";
import { publishEnv } from "../../src/lib/env.server";

type CloudflareRuntimeRequest = Request & {
  runtime?: {
    cloudflare?: {
      env?: Record<string, unknown>;
    };
  };
};

/**
 * Nitro v3 exposes Cloudflare bindings on the request runtime rather than as
 * the second argument of the application handler. Publish that environment
 * before TanStack Start handles the request so the existing server helpers can
 * access D1 (`bananto`), R2, queues and secrets.
 */
export default defineMiddleware((event) => {
  // Nitro v3 exposes platform bindings on `event.req.runtime`. `event.node.req`
  // is the old Nitro v2 shape and is undefined on Cloudflare, which meant the
  // D1/R2 bindings silently disappeared in production.
  const request = event.req as unknown as CloudflareRuntimeRequest;

  // 1. Check request runtime (standard Nitro/Cloudflare)
  let env = request?.runtime?.cloudflare?.env;

  // 2. Check event.context
  if (!env || typeof env !== "object" || Object.keys(env).length === 0) {
    env = (event.context as any)?.cloudflare?.env;
  }

  // 3. Check web request runtime
  if (!env || typeof env !== "object" || Object.keys(env).length === 0) {
    env = (event as any)?.web?.request?.runtime?.cloudflare?.env;
  }

  // 4. Check globalThis.__env__ set by Nitro cloudflare-module preset
  if (!env || typeof env !== "object" || Object.keys(env).length === 0) {
    env = (globalThis as any).__env__;
  }

  // 5. Check globalThis.__CF_ENV__
  if (!env || typeof env !== "object" || Object.keys(env).length === 0) {
    env = (globalThis as any).__CF_ENV__;
  }

  // 6. Fallback to process.env in development or if bindings are missing
  if (!env || typeof env !== "object" || Object.keys(env).length === 0) {
    if (typeof process !== "undefined" && process.env) {
      env = process.env as Record<string, unknown>;
    }
  }

  if (env && typeof env === "object") {
    publishEnv(env);
  }
});
