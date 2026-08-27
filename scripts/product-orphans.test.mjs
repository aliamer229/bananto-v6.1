// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  parseWranglerJson,
  planRepairs,
  reconstructLiveIds,
  stripAnsi,
} from "./lib/product-orphans.mjs";

/**
 * The repair script deletes rows from production. Two failure directions
 * matter, and only one of them is recoverable:
 *
 * - Too cautious → the ghost identity rows stay and keep refusing titles.
 * - Too eager    → a live product's rows are deleted.
 *
 * Everything below exists to pin the second one shut.
 */

const row = (id, extra = {}) => ({
  key: `store:product:${id}`,
  value: JSON.stringify({ id, title: id, ...extra }),
});
const tombstone = (id) => ({
  key: `store:product:${id}`,
  value: JSON.stringify({ id, _deleted: true }),
});
const aggregate = (...ids) => [
  { key: "store:products", value: JSON.stringify(ids.map((id) => ({ id, title: id }))) },
];

describe("reading wrangler's output", () => {
  it("finds the payload past ANSI-coloured warnings", () => {
    // Wrangler prints warnings containing `[` of their own, so "first bracket"
    // lands inside a colour code and the parse fails.
    const noisy =
      "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m Proxy detected.\n" +
      JSON.stringify([{ results: [{ id: "prd_1" }], success: true }]);
    expect(parseWranglerJson(noisy)).toEqual([{ id: "prd_1" }]);
  });

  it("returns nothing rather than throwing when there is no payload", () => {
    expect(parseWranglerJson("Error: no such table")).toEqual([]);
    expect(parseWranglerJson("")).toEqual([]);
  });

  it("strips colour codes", () => {
    expect(stripAnsi("[33mhello[0m")).toContain("hello");
  });
});

describe("reconstructing the live catalogue", () => {
  it("reads the aggregate", () => {
    const { ids } = reconstructLiveIds(aggregate("a", "b"), []);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("stitches chunked aggregate rows back together in key order", () => {
    const products = JSON.stringify([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const half = Math.floor(products.length / 2);
    const rows = [
      { key: "store:products#002", value: products.slice(half) },
      { key: "store:products#001", value: products.slice(0, half) },
      { key: "store:products", value: "" },
    ];
    const { ids } = reconstructLiveIds(rows, []);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("counts a granular product that is not in the aggregate yet", () => {
    // This is a newly created product. Treating it as an orphan would delete a
    // real product's identity the moment it was added.
    const { ids } = reconstructLiveIds(aggregate("a"), [row("brand_new")]);
    expect(ids.has("brand_new")).toBe(true);
  });

  it("removes a product the tombstone marks deleted, even though the aggregate has it", () => {
    const { ids, tombstones } = reconstructLiveIds(aggregate("a", "b"), [tombstone("b")]);
    expect([...ids]).toEqual(["a"]);
    expect([...tombstones]).toEqual(["b"]);
  });

  it("treats an unparseable granular row as live", () => {
    const { ids } = reconstructLiveIds(aggregate("a"), [
      { key: "store:product:mystery", value: "{broken" },
    ]);
    expect(ids.has("mystery")).toBe(true);
  });

  it("refuses to guess when the aggregate itself is corrupt", () => {
    expect(() =>
      reconstructLiveIds([{ key: "store:products", value: "{not json" }], []),
    ).toThrow(/did not parse/i);
  });
});

describe("planning repairs", () => {
  const liveIds = new Set(["live_1", "live_2"]);

  it("refuses to plan against an empty catalogue", () => {
    expect(() => planRepairs({ liveIds: new Set(), tombstones: new Set() })).toThrow(
      /empty catalogue/i,
    );
  });

  it("deletes an identity row whose product is gone", () => {
    const { plan, summary } = planRepairs({
      liveIds,
      tombstones: new Set(),
      identities: [{ product_id: "ghost", title: "Metroid Dread" }],
    });
    expect(summary.identities).toEqual([{ productId: "ghost", title: "Metroid Dread" }]);
    expect(plan).toEqual([`DELETE FROM product_identity WHERE product_id = 'ghost'`]);
  });

  it("never deletes an identity row belonging to a live product", () => {
    const { plan } = planRepairs({
      liveIds,
      tombstones: new Set(),
      identities: [
        { product_id: "live_1", title: "Super Mario Odyssey" },
        { product_id: "live_2", title: "Splatoon 3" },
      ],
    });
    expect(plan).toEqual([]);
  });

  it("clears relational rows for a gone product and leaves live ones alone", () => {
    const { plan } = planRepairs({
      liveIds,
      tombstones: new Set(),
      relations: { game_images: ["ghost", "live_1"], game_aliases: ["live_2"] },
    });
    expect(plan).toEqual([`DELETE FROM game_images WHERE game_id = 'ghost'`]);
  });

  it("removes performance mode children before their parent", () => {
    const { plan } = planRepairs({
      liveIds,
      tombstones: new Set(),
      relations: { game_device_performance: ["ghost"] },
    });
    expect(plan[0]).toContain("game_device_performance_modes");
    expect(plan[1]).toBe(`DELETE FROM game_device_performance WHERE game_id = 'ghost'`);
  });

  it("clears a spent tombstone but keeps one that is still hiding a product", () => {
    // `still_hiding` is in the aggregate, so its tombstone is the only thing
    // keeping it off the storefront. Removing that would resurrect it.
    const stillLive = new Set(["live_1", "still_hiding"]);
    const { plan } = planRepairs({
      liveIds: stillLive,
      tombstones: new Set(["spent", "still_hiding"]),
    });
    expect(plan).toEqual([`DELETE FROM store_kv WHERE key = 'store:product:spent'`]);
  });

  it("never plans a statement against a products, reviews or orders table", () => {
    const { plan } = planRepairs({
      liveIds,
      tombstones: new Set(["spent"]),
      identities: [{ product_id: "ghost", title: "x" }],
      relations: { game_images: ["ghost"], game_catalog: ["ghost"] },
    });
    const joined = plan.join(" ").toLowerCase();
    for (const table of ["product_reviews", "orders", "order_items", "wallet", "users"]) {
      expect(joined, `${table} must never be touched`).not.toContain(table);
    }
  });

  it("escapes quotes in ids so a crafted id cannot break out of the literal", () => {
    const { plan } = planRepairs({
      liveIds,
      tombstones: new Set(),
      identities: [{ product_id: "o'brien", title: "x" }],
    });
    expect(plan[0]).toBe(`DELETE FROM product_identity WHERE product_id = 'o''brien'`);
  });

  it("is idempotent: a second pass over a repaired database plans nothing", () => {
    const repaired = planRepairs({
      liveIds,
      tombstones: new Set(),
      identities: [{ product_id: "live_1", title: "x" }],
      relations: { game_images: ["live_1"] },
    });
    expect(repaired.plan).toEqual([]);
  });
});
