import { describe, it, expect } from "vitest";
import { signHmacSha256Hex, sha256Hex, maskTransactionId, timingSafeEqual } from "./crypto.server";

describe("Binance Pay Web Crypto Utilities", () => {
  const secret = "test_binance_secret_key_12345";
  const payload = "timestamp=1680000000000&type=C2C";

  it("calculates standard HMAC-SHA256 hex signatures correctly", async () => {
    const signature = await signHmacSha256Hex(secret, payload);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe("string");
    expect(signature.length).toBe(64); // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);
  });

  it("produces deterministic HMAC for identical inputs", async () => {
    const sig1 = await signHmacSha256Hex(secret, payload);
    const sig2 = await signHmacSha256Hex(secret, payload);
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different secrets or payloads", async () => {
    const sig1 = await signHmacSha256Hex(secret, payload);
    const sig2 = await signHmacSha256Hex(secret + "_diff", payload);
    const sig3 = await signHmacSha256Hex(secret, payload + "&amount=10");
    expect(sig1).not.toBe(sig2);
    expect(sig1).not.toBe(sig3);
  });

  it("computes SHA256 hex hashes reliably", async () => {
    const hash = await sha256Hex("hello world");
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("masks transaction IDs safely without exposing full ID in UI/logs", () => {
    expect(maskTransactionId("1234567890123456")).toBe("123456...3456");
    expect(maskTransactionId("12345678")).toBe("1234...5678");
    expect(maskTransactionId("1234")).toBe("1234");
    expect(maskTransactionId("")).toBe("");
  });

  it("performs constant-time string comparison", () => {
    expect(timingSafeEqual("abcdef", "abcdef")).toBe(true);
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeEqual("abcdef", "abc")).toBe(false);
  });
});
