import { describe, expect, it } from "vitest";

import { resolveTelegramVerificationReference } from "./telegram-launch";

describe("Telegram verification launch reference", () => {
  it("prefers the signed start_param over browser mirrors", () => {
    expect(
      resolveTelegramVerificationReference({
        initData: "auth_date=1&start_param=signed_reference_123&hash=abc",
        initDataUnsafe: { start_param: "unsafe_reference_456" },
        search: "?session=query_reference_789",
      }),
    ).toBe("signed_reference_123");
  });

  it("accepts the explicit session URL used by the bot Web App button", () => {
    expect(
      resolveTelegramVerificationReference({
        search: "?session=0123456789abcdef0123456789abcdef",
      }),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("supports Telegram's Android tgWebAppStartParam mirror", () => {
    expect(
      resolveTelegramVerificationReference({
        hash: "#tgWebAppStartParam=android_reference_123",
      }),
    ).toBe("android_reference_123");
  });

  it("rejects missing, short, and malformed references", () => {
    expect(resolveTelegramVerificationReference({ search: "?session=short" })).toBeNull();
    expect(
      resolveTelegramVerificationReference({ search: "?session=bad%2Freference%3Fx" }),
    ).toBeNull();
    expect(resolveTelegramVerificationReference({})).toBeNull();
  });
});
