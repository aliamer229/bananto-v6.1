import { afterEach, describe, expect, it, vi } from "vitest";

describe("Cloudflare environment fallback", () => {
  afterEach(() => {
    vi.doUnmock("node:async_hooks");
    vi.resetModules();
    delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
  });

  it("keeps bindings available when AsyncLocalStorage is not implemented", async () => {
    vi.resetModules();
    vi.doMock("node:async_hooks", () => ({
      AsyncLocalStorage: class {
        enterWith() {
          throw new Error("asyncLocalStorage.enterWith() is not implemented");
        }

        getStore() {
          throw new Error("asyncLocalStorage.getStore() is not implemented");
        }
      },
    }));

    const { getEnv, publishEnv } = await import("./env.server");
    const database = { prepare: vi.fn() };

    expect(() => publishEnv({ APP_ENV: "production", bananto: database })).not.toThrow();
    expect(getEnv()).toMatchObject({ APP_ENV: "production", bananto: database });
  });
});
