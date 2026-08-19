// Node/Vitest does not provide Cloudflare's runtime-only built-in module.
// Tests continue to inject their environment through publishEnv().
export const env: Record<string, unknown> = {};
