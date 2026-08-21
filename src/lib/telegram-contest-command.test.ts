import { describe, expect, it } from "vitest";

import { parseContestCommand } from "./telegram-admin-console.server";

/**
 * The contest command is the operator's whole authoring surface, and it posts
 * publicly to a channel, so what it accepts matters: a mistyped target must be
 * refused rather than published somewhere unintended.
 */
describe("parseContestCommand", () => {
  it("takes a title and a prize, defaulting the rest", () => {
    const parsed = parseContestCommand("/contest مسابقة الأسبوع | بطاقة eShop");
    expect(parsed).toEqual({
      title: "مسابقة الأسبوع",
      prize: "بطاقة eShop",
      winnersCount: 1,
    });
  });

  it("reads winners, a channel and a group topic", () => {
    const parsed = parseContestCommand("/contest سحب كبير | سويتش OLED | 3 | @banan_to | 42");
    expect(parsed).toEqual({
      title: "سحب كبير",
      prize: "سويتش OLED",
      winnersCount: 3,
      channelId: "@banan_to",
      messageThreadId: 42,
    });
  });

  it("accepts a numeric group id as the target", () => {
    const parsed = parseContestCommand("/contest عنوان | جائزة | 1 | -1001234567890");
    expect(parsed).toMatchObject({ channelId: "-1001234567890" });
  });

  it("tolerates the @botname suffix Telegram adds in groups", () => {
    expect(parseContestCommand("/contest@bananto_bot عنوان | جائزة")).toMatchObject({
      title: "عنوان",
    });
  });

  it("refuses what it cannot safely publish", () => {
    expect(parseContestCommand("/contest")).toEqual({ error: "empty" });
    expect(parseContestCommand("/contest ab | جائزة")).toEqual({ error: "title" });
    expect(parseContestCommand("/contest عنوان طويل")).toEqual({ error: "prize" });
    expect(parseContestCommand("/contest عنوان | جائزة | 0")).toEqual({ error: "winners" });
    expect(parseContestCommand("/contest عنوان | جائزة | 1000")).toEqual({ error: "winners" });
    expect(parseContestCommand("/contest عنوان | جائزة | 1 | not a channel")).toEqual({
      error: "target",
    });
    expect(parseContestCommand("/contest عنوان | جائزة | 1 | @banan_to | abc")).toEqual({
      error: "topic",
    });
    expect(parseContestCommand(`/contest ${"x".repeat(250)} | جائزة`)).toEqual({
      error: "too_long",
    });
  });
});
