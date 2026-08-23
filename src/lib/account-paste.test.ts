import { describe, expect, it } from "vitest";

import {
  matchAccountsToOrder,
  matchHintToOrderItems,
  parseAccountLine,
  parseAccountPaste,
} from "./account-paste";

/**
 * These are the exact shapes staff paste. What matters in every case is that
 * only the login and the password come out — no Chinese, no labels, no bundle
 * notes — because whatever this returns is what reaches the member.
 */
describe("parseAccountLine", () => {
  it("reads the unlabelled login before 密码", () => {
    expect(parseAccountLine("ttxx7834 密码 a8dqq9sr 运动switch")).toMatchObject({
      username: "ttxx7834",
      password: "a8dqq9sr",
    });
  });

  it("reads a labelled email account", () => {
    expect(parseAccountLine("游戏 FC26 账号 e8yuh8S9@xiaohu666.com 密码 qw83150220")).toMatchObject(
      {
        username: "e8yuh8S9@xiaohu666.com",
        password: "qw83150220",
      },
    );
  });

  it("never lets Chinese text through as a credential", () => {
    const parsed = parseAccountLine("bbmm5477 密码 sr2af42m 星球大战 亡命之徒 黄金版");
    expect(parsed).toMatchObject({ username: "bbmm5477", password: "sr2af42m" });
    expect(parsed!.username + parsed!.password).not.toMatch(/[一-鿿]/);
  });

  it("ignores the bundle note that follows the game name", () => {
    expect(parseAccountLine("pptt2207 密码 tk58j6vk 塞尔达传说 买三送一")).toMatchObject({
      username: "pptt2207",
      password: "tk58j6vk",
    });
  });

  it("handles colon and equals separators", () => {
    expect(parseAccountLine("账号：user_01 密码：Pass99xy")).toMatchObject({
      username: "user_01",
      password: "Pass99xy",
    });
    expect(parseAccountLine("account=abc123 password=Zx99qq11")).toMatchObject({
      username: "abc123",
      password: "Zx99qq11",
    });
  });

  it("reads a plain pair with no markers at all", () => {
    expect(parseAccountLine("account1@mail.com:Pass123")).toMatchObject({
      username: "account1@mail.com",
      password: "Pass123",
    });
    expect(parseAccountLine("account2@mail.com,Pass456")).toMatchObject({
      username: "account2@mail.com",
      password: "Pass456",
    });
    expect(parseAccountLine("account3@mail.com Pass789")).toMatchObject({
      username: "account3@mail.com",
      password: "Pass789",
    });
    expect(parseAccountLine("player_one|Pass1")).toMatchObject({
      username: "player_one",
      password: "Pass1",
    });
  });

  it("refuses a line with no usable pair", () => {
    expect(parseAccountLine("塞尔达传说 买三送一")).toBeNull();
    expect(parseAccountLine("ttxx7834")).toBeNull();
    expect(parseAccountLine("")).toBeNull();
    expect(parseAccountLine("# comment")).toBeNull();
  });
});

describe("parseAccountPaste", () => {
  it("takes four accounts from four lines", () => {
    const { accounts, skipped } = parseAccountPaste(
      [
        "  ttxx7834 密码 a8dqq9sr 运动switch",
        "rrtt8896 密码 45g54pby 朋友收集 梦想生活",
        " bbmm5477 密码 sr2af42m 星球大战 亡命之徒 黄金版",
        "rrtt8621 密码 339uxqh6 运动switch",
      ].join("\n"),
    );
    expect(skipped).toHaveLength(0);
    expect(accounts.map((a) => [a.username, a.password])).toEqual([
      ["ttxx7834", "a8dqq9sr"],
      ["rrtt8896", "45g54pby"],
      ["bbmm5477", "sr2af42m"],
      ["rrtt8621", "339uxqh6"],
    ]);
  });

  it("keeps different supplier lines for a repeated login but drops an exact repeat", () => {
    const { accounts, duplicates } = parseAccountPaste(
      [
        "ttxx7834 密码 aaaa1111 运动switch",
        "TTXX7834 密码 bbbb2222 朋友收集 梦想生活",
        "ttxx7834 密码 aaaa1111 运动switch",
        "zzzz9999 密码 cccc3333",
      ].join("\n"),
    );
    expect(accounts.map((a) => a.username)).toEqual(["ttxx7834", "TTXX7834", "zzzz9999"]);
    expect(duplicates).toEqual(["TTXX7834", "ttxx7834"]);
  });

  it("reports a line it could not read instead of inventing one", () => {
    const { accounts, skipped } = parseAccountPaste("good1234 密码 pass5678\n塞尔达传说");
    expect(accounts).toHaveLength(1);
    expect(skipped).toEqual([{ line: 2, raw: "塞尔达传说" }]);
  });

  it("mixes both supplier formats in one paste", () => {
    const { accounts } = parseAccountPaste(
      "ttxx7834 密码 a8dqq9sr 运动switch\n游戏 FC26 账号 e8yuh8S9@xiaohu666.com 密码 qw83150220",
    );
    expect(accounts).toHaveLength(2);
    expect(accounts[1]!.username).toBe("e8yuh8S9@xiaohu666.com");
  });
});

describe("matchAccountsToOrder", () => {
  const fourSupplierLines = [
    "ttxx7834 密码 a8dqq9sr 运动switch",
    "rrtt8896 密码 45g54pby 朋友收集 梦想生活",
    "bbmm5477 密码 sr2af42m 星球大战 亡命之徒 黄金版",
    "rrtt8621 密码 339uxqh6 运动switch",
  ].join("\n");

  it("maps the four supplied accounts 1:1, including two separate Sports lines", () => {
    const parsed = parseAccountPaste(fourSupplierLines);
    const matched = matchAccountsToOrder(parsed.accounts, [
      { id: "sports-a", title: "Nintendo Switch Sports", quantity: 1 },
      { id: "tomodachi", title: "Tomodachi Life: Living the Dream", quantity: 1 },
      { id: "star-wars", title: "Star Wars Outlaws Gold Edition", quantity: 1 },
      { id: "sports-b", title: "Nintendo Switch Sports", quantity: 1 },
    ]);

    expect(matched.map((entry) => entry.matchedItemId)).toEqual([
      "sports-a",
      "tomodachi",
      "star-wars",
      "sports-b",
    ]);
    expect(matched.map((entry) => entry.account.username)).toEqual([
      "ttxx7834",
      "rrtt8896",
      "bbmm5477",
      "rrtt8621",
    ]);
    expect(new Set(matched.map((entry) => entry.account.password)).size).toBe(4);
  });

  it("honours quantity capacity and never puts an extra account into a filled game", () => {
    const parsed = parseAccountPaste(
      "one111 密码 pass1111 运动switch\ntwo222 密码 pass2222 运动switch\nthree333 密码 pass3333 运动switch",
    );
    const matched = matchAccountsToOrder(parsed.accounts, [
      { id: "sports", title: "Nintendo Switch Sports", quantity: 2 },
    ]);
    expect(matched.map((entry) => entry.matchStatus)).toEqual([
      "matched",
      "matched",
      "needs_matching",
    ]);
    expect(matched[0]?.slotNumber).toBe(1);
    expect(matched[1]?.slotNumber).toBe(2);
    expect(matched[2]?.matchedItemId).toBeUndefined();
  });

  it("leaves an unknown label unmapped even when the order has one game", () => {
    expect(
      matchHintToOrderItems("unknown supplier label", [
        { id: "only-game", title: "Nintendo Switch Sports", quantity: 1 },
      ]),
    ).toEqual({ item: null, confidence: 0 });
  });

  it("distinguishes Tomodachi from Animal Crossing in the same order", () => {
    expect(
      matchHintToOrderItems("朋友收集 梦想生活", [
        { id: "animal-crossing", title: "Animal Crossing: New Horizons", quantity: 1 },
        { id: "tomodachi", title: "Tomodachi Life: Living the Dream", quantity: 1 },
      ]).item?.id,
    ).toBe("tomodachi");
  });

  it("refuses an ambiguous franchise-only hint", () => {
    expect(
      matchHintToOrderItems("mario", [
        { id: "wonder", title: "Super Mario Bros. Wonder", quantity: 1 },
        { id: "odyssey", title: "Super Mario Odyssey", quantity: 1 },
      ]),
    ).toEqual({ item: null, confidence: 0 });
  });
});
