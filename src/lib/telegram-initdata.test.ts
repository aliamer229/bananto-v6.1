import { afterEach, describe, expect, it } from "vitest";

import { publishEnv } from "./env.server";
import { verifyTelegramInitData } from "./telegram.server";

const BOT_TOKEN = "1234567890:AAHtesttokenvaluethatislongenough";

afterEach(() => publishEnv({}));

/** Sign a launch payload exactly the way Telegram does. */
async function signInitData(fields: Record<string, string>): Promise<string> {
  const encoder = new TextEncoder();
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const webAppDataKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", webAppDataKey, encoder.encode(BOT_TOKEN));
  const secretKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(dataCheckString));
  const hash = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

const USER = JSON.stringify({ id: 55512345, first_name: "Ali" });

describe("Telegram Mini App launch data", () => {
  it("accepts a freshly signed launch and returns the Telegram identity", async () => {
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const initData = await signInitData({ auth_date: String(nowSeconds()), user: USER });

    const result = await verifyTelegramInitData(initData);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(55512345);
    expect(result.reason).toBeUndefined();
  });

  it("keeps a usable start_param from the signed payload", async () => {
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const reference = "a".repeat(48);
    const initData = await signInitData({
      auth_date: String(nowSeconds()),
      start_param: reference,
      user: USER,
    });

    const result = await verifyTelegramInitData(initData);

    expect(result.valid).toBe(true);
    expect(result.startParam).toBe(reference);
  });

  it("still authenticates a launch whose start_param this app cannot use", async () => {
    // Telegram fills start_param from links the bot does not control. Rejecting
    // the whole payload turned those launches into "could not verify Telegram
    // session" even though the signature was perfectly valid.
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const initData = await signInitData({
      auth_date: String(nowSeconds()),
      start_param: "short",
      user: USER,
    });

    const result = await verifyTelegramInitData(initData);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(55512345);
    expect(result.startParam).toBeUndefined();
  });

  it("survives a page reload inside the Mini App", async () => {
    // initData is signed once at launch and replayed on every reload, so a
    // payload minutes old must still authenticate.
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const initData = await signInitData({
      auth_date: String(nowSeconds() - 15 * 60),
      user: USER,
    });

    expect((await verifyTelegramInitData(initData)).valid).toBe(true);
  });

  it("reports a stale launch separately from a forged one", async () => {
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const stale = await signInitData({
      auth_date: String(nowSeconds() - 25 * 60 * 60),
      user: USER,
    });

    const result = await verifyTelegramInitData(stale);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("stale");
  });

  it("rejects a tampered payload", async () => {
    publishEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
    const initData = await signInitData({ auth_date: String(nowSeconds()), user: USER });
    const forged = initData.replace(
      encodeURIComponent(USER),
      encodeURIComponent(JSON.stringify({ id: 999, first_name: "Mallory" })),
    );

    const result = await verifyTelegramInitData(forged);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects a payload signed with a different bot token", async () => {
    const initData = await signInitData({ auth_date: String(nowSeconds()), user: USER });
    publishEnv({ TELEGRAM_BOT_TOKEN: "9876543210:BBanothertokenentirelydifferent" });

    expect((await verifyTelegramInitData(initData)).reason).toBe("bad_signature");
  });

  it("reports a missing bot token instead of pretending the launch was forged", async () => {
    publishEnv({});
    const result = await verifyTelegramInitData("auth_date=1&hash=deadbeef");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("bot_token_missing");
  });
});
