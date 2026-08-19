import { afterEach, describe, expect, it } from "vitest";

import { publishEnv } from "./env.server";
import { isOwnerAccount, verifiedOwnerIdentity } from "./owner-auth.server";

afterEach(() => publishEnv({}));

describe("owner authorization", () => {
  it("matches Iraqi local and E.164 spellings as the same verified phone", () => {
    publishEnv({ OWNER_PHONES: "07801234567" });
    expect(isOwnerAccount({ phone: "+9647801234567" })).toBe(true);
    expect(isOwnerAccount({ phone: "07801234568" })).toBe(false);
  });

  it("matches configured owner emails case-insensitively", () => {
    publishEnv({ OWNER_EMAILS: "owner@example.com" });
    expect(isOwnerAccount({ email: "Owner@Example.com" })).toBe(true);
    expect(isOwnerAccount({ email: "member@example.com" })).toBe(false);
  });

  it("never trusts an unverified password-account email", () => {
    expect(
      verifiedOwnerIdentity({
        email: "owner@example.com",
        provider: "password",
      }),
    ).toEqual({});
  });

  it("accepts only provider email or an already verified phone", () => {
    expect(
      verifiedOwnerIdentity({
        email: "owner@example.com",
        phone: "+9647801234567",
        phoneVerifiedAt: "2026-08-15T00:00:00.000Z",
        provider: "google",
      }),
    ).toEqual({
      email: "owner@example.com",
      phone: "+9647801234567",
    });
  });
});
