import { afterEach, describe, expect, it } from "vitest";

import { publishEnv } from "./env.server";
import {
  isAdminCallback,
  isAdminPrivateMessage,
  isTelegramAdmin,
  telegramAdminIds,
} from "./telegram-admin.server";

/**
 * The operator's bot and a member's bot are the same bot; this check is the
 * only thing between them. Everything here is a way someone could try to be
 * mistaken for the operator.
 */

afterEach(() => publishEnv({}));

describe("telegram admin identity", () => {
  it("defaults to the store owner when nothing is configured", () => {
    expect(telegramAdminIds()).toEqual(["6404042791"]);
    expect(isTelegramAdmin("6404042791")).toBe(true);
    expect(isTelegramAdmin(6404042791)).toBe(true);
  });

  it("accepts several configured operators", () => {
    publishEnv({ TELEGRAM_ADMIN_CHAT_ID: "111111111, 222222222" });
    expect(isTelegramAdmin("111111111")).toBe(true);
    expect(isTelegramAdmin("222222222")).toBe(true);
    expect(isTelegramAdmin("333333333")).toBe(false);
  });

  it("rejects everything that is not a plain numeric id", () => {
    for (const value of [
      "",
      " ",
      null,
      undefined,
      "6404042791 ",
      "6404042791x",
      "640404279",
      "06404042791",
      ["6404042791"],
      { id: "6404042791" },
    ]) {
      if (value === "6404042791 ") continue; // trimmed on purpose
      expect(isTelegramAdmin(value as unknown)).toBe(false);
    }
    expect(isTelegramAdmin("6404042791 ")).toBe(true);
  });

  it("only trusts a private message the operator sent themselves", () => {
    const from = { id: 6404042791 };
    expect(isAdminPrivateMessage({ chat: { id: 6404042791, type: "private" }, from })).toBe(true);

    // A group the operator happens to be in is not their console.
    expect(isAdminPrivateMessage({ chat: { id: -100123, type: "supergroup" }, from })).toBe(false);
    // A private chat whose id is not the sender's is a chat with someone else.
    expect(isAdminPrivateMessage({ chat: { id: 999, type: "private" }, from })).toBe(false);
    // A bot cannot be the operator.
    expect(
      isAdminPrivateMessage({
        chat: { id: 6404042791, type: "private" },
        from: { id: 6404042791, is_bot: true },
      }),
    ).toBe(false);
    // Somebody else entirely.
    expect(isAdminPrivateMessage({ chat: { id: 555, type: "private" }, from: { id: 555 } })).toBe(
      false,
    );
    expect(isAdminPrivateMessage(undefined)).toBe(false);
  });

  it("judges a button press by who pressed it", () => {
    expect(
      isAdminCallback({ from: { id: 6404042791 }, message: { chat: { type: "private" } } }),
    ).toBe(true);
    // The operator's message forwarded into a group must not turn everyone
    // there into an operator.
    expect(
      isAdminCallback({ from: { id: 6404042791 }, message: { chat: { type: "supergroup" } } }),
    ).toBe(false);
    expect(isAdminCallback({ from: { id: 42 }, message: { chat: { type: "private" } } })).toBe(
      false,
    );
    expect(isAdminCallback(undefined)).toBe(false);
  });
});
