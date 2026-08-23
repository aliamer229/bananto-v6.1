import { describe, expect, it } from "vitest";

import {
  ORDER_ITEM_TITLE_UNAVAILABLE_AR,
  indexProducts,
  orderItemTitleOf,
  orderTitleSummary,
  resolveOrderItemTitle,
  resolveOrderTitles,
  unresolvedTitleIds,
} from "./order-item-title";
import { matchAccountsToOrder, parseAccountPaste } from "./account-paste";

const CATALOGUE = [
  { id: "p1", title: "Nintendo Switch Sports" },
  { id: "p2", title: "EA SPORTS FC 26" },
];

describe("resolveOrderItemTitle", () => {
  it("prefers the live product title so a renamed game reads correctly", () => {
    const resolved = resolveOrderItemTitle(
      { id: "it_1", productId: "p1", title: "الاسم القديم" },
      CATALOGUE,
    );
    expect(resolved).toEqual({
      ok: true,
      title: "Nintendo Switch Sports",
      source: "product",
      itemId: "it_1",
      productId: "p1",
    });
  });

  it("falls back to the title the item was bought under", () => {
    // Still the same chain — the stored title is a copy of product.title.
    const resolved = resolveOrderItemTitle({ id: "it_1", productId: "p9", title: "لعبة" });
    expect(resolved.ok && resolved.source).toBe("order_item");
    expect(resolved.title).toBe("لعبة");
  });

  it("accepts a numeric product id", () => {
    const resolved = resolveOrderItemTitle({ id: "it_1", productId: 1 }, [
      { id: 1, title: "Mario Kart" },
    ]);
    expect(resolved.title).toBe("Mario Kart");
  });

  it("reports a failure instead of inventing a name", () => {
    const resolved = resolveOrderItemTitle({ id: "it_1", productId: "p9", title: "  " });
    expect(resolved).toEqual({
      ok: false,
      title: null,
      reason: "no_title",
      itemId: "it_1",
      productId: "p9",
    });
    // This is the whole point: the queue used to show "منتج رقمي" here, which
    // is indistinguishable from a real product with that name.
    expect(orderItemTitleOf({ id: "it_1", productId: "p9", title: "" })).toBe(
      ORDER_ITEM_TITLE_UNAVAILABLE_AR,
    );
  });

  it("never throws on a missing or malformed item", () => {
    for (const item of [null, undefined, {}, 0 as never, "x" as never]) {
      expect(() => resolveOrderItemTitle(item as never)).not.toThrow();
      expect(resolveOrderItemTitle(item as never).ok).toBe(false);
    }
  });
});

describe("resolving a whole order", () => {
  const items = [
    { id: "it_1", productId: "p1", title: "old" },
    { id: "it_2", productId: "p2", title: "" },
    { id: "it_3", productId: "p9", title: "لعبة ثالثة" },
  ];

  it("keeps an unnameable item in the list so the counts still line up", () => {
    const resolved = resolveOrderTitles(items, CATALOGUE);
    expect(resolved).toHaveLength(3);
    expect(resolved.map((r) => r.ok)).toEqual([true, true, true]);
  });

  it("names the failures by id, and only by id", () => {
    const resolved = resolveOrderTitles(items);
    const unresolved = unresolvedTitleIds(resolved);
    expect(unresolved).toEqual([{ itemId: "it_2", productId: "p2", reason: "no_title" }]);
  });

  it("summarises an order without swallowing the broken item", () => {
    const summary = orderTitleSummary(items);
    expect(summary).toBe(`old، ${ORDER_ITEM_TITLE_UNAVAILABLE_AR}، لعبة ثالثة`);
  });

  it("says so for an order whose items have not loaded", () => {
    expect(orderTitleSummary([])).toBe(ORDER_ITEM_TITLE_UNAVAILABLE_AR);
    expect(orderTitleSummary(null)).toBe(ORDER_ITEM_TITLE_UNAVAILABLE_AR);
  });
});

describe("indexProducts", () => {
  it("skips catalogue rows with no id or no title", () => {
    const index = indexProducts([{ id: "p1", title: "A" }, { id: "", title: "B" }, { id: "p3" }]);
    expect([...index.entries()]).toEqual([["p1", "A"]]);
  });
});

describe("Quick Paste never spreads one account across an order", () => {
  const orderItems = [
    { id: "it_1", title: "Nintendo Switch Sports", quantity: 1 },
    { id: "it_2", title: "EA SPORTS FC 26", quantity: 1 },
    { id: "it_3", title: "The Legend of Zelda", quantity: 1 },
    { id: "it_4", title: "Mario Kart 8 Deluxe", quantity: 1 },
  ];

  it("gives each line its own account, matched by its own hint", () => {
    const paste = [
      "ttxx7834 密码 a8dqq9sr 运动switch",
      "游戏 FC26 账号 e8yuh8S9@xiaohu666.com 密码 qw83150220",
      "pptt2207 密码 tk58j6vk 塞尔达传说 买三送一",
    ].join("\n");

    const { accounts } = parseAccountPaste(paste);
    expect(accounts).toHaveLength(3);

    const matched = matchAccountsToOrder(accounts, orderItems);
    const logins = matched.map((m) => m.account.username);
    // Three distinct accounts, not one repeated.
    expect(new Set(logins).size).toBe(3);
    expect(logins).toEqual(["ttxx7834", "e8yuh8S9@xiaohu666.com", "pptt2207"]);

    const assigned = matched.filter((m) => m.matchedItemId).map((m) => m.matchedItemId);
    // No item receives two different accounts.
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("leaves an unrecognisable line unassigned rather than guessing", () => {
    const { accounts } = parseAccountPaste("zzqq1111 密码 pw11aa22 لعبة غير معروفة تمامًا");
    const matched = matchAccountsToOrder(accounts, orderItems);
    expect(matched[0]?.matchStatus).toBe("needs_matching");
    expect(matched[0]?.matchedItemId).toBeUndefined();
  });
});
