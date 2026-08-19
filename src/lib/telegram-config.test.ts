import { afterEach, describe, expect, it } from "vitest";

import { publishEnv } from "./env.server";
import {
  requireWebhookSecret,
  telegramBotStartDeepLink,
  telegramPublicOrigin,
  telegramWebAppUrl,
} from "./telegram.server";

afterEach(() => publishEnv({}));

describe("Telegram production links and secrets", () => {
  it("uses the reliable bot start flow and preserves the Mini App session", () => {
    publishEnv({
      APP_ENV: "production",
      APP_URL: "https://banan.to",
      TELEGRAM_BOT_USERNAME: "Bananto_store_bot",
    });
    expect(telegramBotStartDeepLink("reference_123")).toBe(
      "https://t.me/Bananto_store_bot?start=reference_123",
    );
    expect(telegramWebAppUrl("reference_123")).toBe(
      "https://banan.to/telegram?session=reference_123",
    );
  });

  it("rejects unsafe public origins", () => {
    publishEnv({ APP_ENV: "production", APP_URL: "http://attacker.invalid/path" });
    expect(telegramPublicOrigin()).toBe("https://banan.to");
  });

  it("accepts compatible webhook secrets but rejects short ones", () => {
    publishEnv({ APP_ENV: "production", TELEGRAM_WEBHOOK_SECRET: "1234567890abcdef" });
    expect(requireWebhookSecret()).toBe("1234567890abcdef");

    publishEnv({ APP_ENV: "production", TELEGRAM_WEBHOOK_SECRET: "too-short" });
    expect(() => requireWebhookSecret()).toThrow("TELEGRAM_WEBHOOK_SECRET_MISSING_PRODUCTION");
  });
});
