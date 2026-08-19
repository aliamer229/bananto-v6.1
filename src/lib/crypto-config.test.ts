import { afterEach, describe, expect, it } from "vitest";

import { sessionSecretConfigured } from "./crypto.server";
import { publishEnv } from "./env.server";

afterEach(() => publishEnv({}));

describe("session secret readiness", () => {
  it("accepts compatible 128-bit-or-longer session secrets", () => {
    publishEnv({ SESSION_SECRET: "1234567890abcdef" });
    expect(sessionSecretConfigured()).toBe(true);
  });

  it("rejects missing and trivially short session secrets", () => {
    publishEnv({ APP_ENV: "production", SESSION_SECRET: "too-short" });
    expect(sessionSecretConfigured()).toBe(false);
  });
});
