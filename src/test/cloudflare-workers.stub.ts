// Node/Vitest does not provide Cloudflare's runtime-only built-in module.
// Tests continue to inject their environment through publishEnv().
export const env: Record<string, unknown> = {};

export class DurableObject {
  ctx: any;
  env: any;
  constructor(ctx: any, env: any) {
    this.ctx = ctx;
    this.env = env;
  }
}
