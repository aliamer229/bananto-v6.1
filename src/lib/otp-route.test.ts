import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishEnv } from "./env.server";
import { normalizePhone, arePhonesEqual } from "./phone";
import { resolveTelegramVerificationReference } from "./telegram-launch";

describe("OTP & Phone verification logic", () => {
  beforeEach(() => {
    vi.resetModules();
    publishEnv({
      SESSION_SECRET: "abcdef1234567890abcdef1234567890",
      ACCOUNT_ENC_KEY: "01234567890123456789012345678901",
    });
  });

  afterEach(() => publishEnv({}));

  describe("Phone normalization & comparison", () => {
    it("normalizes Iraqi numbers correctly", () => {
      expect(normalizePhone("07701234567")).toBe("+9647701234567");
      expect(normalizePhone("7701234567")).toBe("+9647701234567");
      expect(normalizePhone("+964 770 123 4567")).toBe("+9647701234567");
      expect(normalizePhone("009647701234567")).toBe("+9647701234567");
    });

    it("correctly compares international and national formats", () => {
      expect(arePhonesEqual("07701234567", "+9647701234567")).toBe(true);
      expect(arePhonesEqual("+9647701234567", "9647701234567")).toBe(true);
      expect(arePhonesEqual("07701234567", "07801234567")).toBe(false);
    });

    it("extracts member ID safely from strings and numbers", () => {
      const extractMemberId = (data: { memberId?: unknown; phone?: unknown }) => {
        const rawMemberId =
          data.memberId ??
          (typeof data.phone === "string" && data.phone.startsWith("member:")
            ? data.phone.slice(7)
            : "");
        return String(rawMemberId ?? "")
          .trim()
          .replace(/\D/g, "");
      };

      expect(extractMemberId({ memberId: "12345" })).toBe("12345");
      expect(extractMemberId({ memberId: 12345 as any })).toBe("12345");
      expect(extractMemberId({ phone: "member:67890" })).toBe("67890");
      expect(extractMemberId({ phone: "+9647701234567" })).toBe("");
      expect(extractMemberId({})).toBe("");
      expect(extractMemberId({ memberId: null })).toBe("");
      expect(extractMemberId({ memberId: undefined })).toBe("");
    });
  });

  describe("Telegram launch & reference validation", () => {
    it("accepts valid token references", () => {
      expect(
        resolveTelegramVerificationReference({
          search: "?session=abcdef1234567890",
        }),
      ).toBe("abcdef1234567890");
    });

    it("rejects invalid or unsafe references", () => {
      expect(
        resolveTelegramVerificationReference({
          search: "?session=short",
        }),
      ).toBeNull();
      expect(resolveTelegramVerificationReference({})).toBeNull();
    });
  });
});
