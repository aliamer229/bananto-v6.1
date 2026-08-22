declare module "cloudflare:workers" {
  /** Bindings exposed by the Cloudflare Workers runtime. */
  export const env: Record<string, unknown>;
  export class DurableObject<Env = unknown> {
    ctx: any;
    env: Env;
    constructor(ctx: any, env: Env);
  }
}
