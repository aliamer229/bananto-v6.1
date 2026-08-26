import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeOtpHash,
  verifyOtpCode,
  sendTelegramOtp,
  resolveTelegramChatId,
  telegramOtpMessage,
  assertOtp,
  OtpError,
} from "./otp.server";

describe("Telegram OTP Architecture & Decoupled Delivery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("formats clear, clickable Arabic Telegram OTP message", () => {
    const msg = telegramOtpMessage("849201", "signup");
    expect(msg).toContain("🍌 <b>رمز التحقق الخاص بك في بنانتو</b>");
    expect(msg).toContain("<code>849201</code>");
    expect(msg).toContain("إنشاء حساب جديد");
    expect(msg).toContain("ينتهي الرمز خلال 5 دقائق");
  });

  it("formats correct purpose titles for all auth flows", () => {
    const signupMsg = telegramOtpMessage("123456", "signup");
    expect(signupMsg).toContain("إنشاء حساب جديد");

    const resetMsg = telegramOtpMessage("123456", "reset");
    expect(resetMsg).toContain("استعادة كلمة المرور");

    const loginMsg = telegramOtpMessage("123456", "login");
    expect(loginMsg).toContain("تسجيل الدخول");

    const verifyMsg = telegramOtpMessage("123456", "verify");
    expect(verifyMsg).toContain("توثيق رقم الهاتف");
  });

  it("computes HMAC-SHA-256 bound to phone and purpose", async () => {
    const code = "654321";
    const phone = "+9647701234567";
    const hash = await computeOtpHash(code, phone, "signup");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // 32 bytes in hex

    const valid = await verifyOtpCode(code, phone, "signup", hash);
    expect(valid).toBe(true);

    const invalidCode = await verifyOtpCode("111111", phone, "signup", hash);
    expect(invalidCode).toBe(false);

    const invalidPurpose = await verifyOtpCode(code, phone, "reset", hash);
    expect(invalidPurpose).toBe(false);
  });
});
