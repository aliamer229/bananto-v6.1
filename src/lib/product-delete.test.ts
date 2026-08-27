// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The delete path is D1-bound, so these assert the *shape* of the fix rather
 * than running it: that both routes delegate to one owner, that the owner does
 * its steps in the order that never uncovers the product, and that the two
 * specific mistakes which caused the original bug cannot come back.
 *
 * The behavioural half is covered by the catalogue-cache tests beside this and
 * by `npm run repair:products -- --dry-run` against a real database.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const OWNER = read("src/lib/product-delete.server.ts");
const COLLECTION_ROUTE = read("src/routes/api/admin/products.ts");
const ITEM_ROUTE = read("src/routes/api/admin/products.$productId.ts");
const IDENTITY = read("src/lib/product-identity.server.ts");
const DB = read("src/lib/db.server.ts");

describe("both delete routes share one owner", () => {
  it("neither route hand-rolls its own delete any more", () => {
    for (const [name, source] of [
      ["collection", COLLECTION_ROUTE],
      ["item", ITEM_ROUTE],
    ] as const) {
      expect(source, `${name} route should call the shared owner`).toContain(
        "deleteProductEverywhere(",
      );
    }
  });

  it("the collection route no longer races the tombstone against its own deletion", () => {
    /*
      The original bug: an `INSERT` of `store:product:<id>` with `_deleted: true`
      sat in the same `Promise.allSettled` as `hardDeleteProductRelations`,
      whose own `DELETE FROM store_kv WHERE key = 'store:product:<id>'` removed
      the tombstone that had just been written.
    */
    expect(COLLECTION_ROUTE).not.toMatch(/Promise\.allSettled\(\[[\s\S]*hardDeleteProductRelations/);
    expect(COLLECTION_ROUTE).not.toContain("_deleted: true");
  });

  it("neither route reports success without the server having verified it", () => {
    for (const [name, source] of [
      ["collection", COLLECTION_ROUTE],
      ["item", ITEM_ROUTE],
    ] as const) {
      expect(source, `${name} route must branch on the verification result`).toContain(
        "if (!result.ok)",
      );
      expect(source, `${name} route must report what survived`).toContain("DELETE_INCOMPLETE");
    }
  });
});

describe("the owner deletes in an order that never uncovers the product", () => {
  it("tombstones before rewriting the aggregate, and clears mirrors last", () => {
    const tombstone = OWNER.indexOf("await writeTombstone(id)");
    const aggregate = OWNER.indexOf("await updateStore(");
    const relations = OWNER.indexOf("await hardDeleteProductRelations(id)");
    const verify = OWNER.lastIndexOf("findRemainingProductRepresentations(id, slug)");

    expect(tombstone).toBeGreaterThan(-1);
    expect(aggregate).toBeGreaterThan(tombstone);
    expect(relations).toBeGreaterThan(aggregate);
    expect(verify).toBeGreaterThan(relations);
  });

  it("keeps the product hidden when the aggregate rewrite fails", () => {
    // The tombstone is deliberately not rolled back: a half-finished delete
    // should leave the product hidden, not flickering back.
    const failureBranch = OWNER.slice(
      OWNER.indexOf("catch (err) {", OWNER.indexOf("await updateStore(")),
    );
    expect(failureBranch).toContain("ok: false");
    expect(failureBranch.slice(0, 900)).not.toContain("DELETE FROM store_kv");
  });
});

describe("verification covers every representation a product lives in", () => {
  it("checks the aggregate by id and by slug, the granular row and the identity row", () => {
    for (const needle of [
      '"aggregate:id"',
      '"aggregate:slug"',
      '"store_kv:granular"',
      '"d1:product_identity"',
      '"public:listing"',
    ]) {
      expect(OWNER).toContain(needle);
    }
  });

  it("reads the row-level checks straight from D1, not through the store cache", () => {
    expect(OWNER).toContain("FROM store_kv WHERE key = ?");
    expect(OWNER).toContain("FROM product_identity WHERE product_id = ?");
  });

  it("does not count a tombstone as a surviving product", () => {
    expect(OWNER).toContain("_deleted");
    expect(OWNER).toMatch(/A tombstone is not a survivor/);
  });
});

describe("history survives a delete", () => {
  it("clears catalogue rows but never reviews, orders or wallet history", () => {
    const deletes = [...IDENTITY.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1]);
    expect(deletes).toContain("product_identity");
    expect(deletes).toContain("game_catalog");
    for (const preserved of [
      "product_reviews",
      "orders",
      "order_items",
      "wallet_transactions",
      "users",
    ]) {
      expect(deletes, `${preserved} must not be deleted with a product`).not.toContain(preserved);
    }
  });

  it("releases the identity claim so the same game can be added again", () => {
    expect(IDENTITY).toContain("DELETE FROM product_identity WHERE product_id = ?");
  });
});

describe("the catalogue version is durable, not per-isolate", () => {
  it("is read from store_rev, which every isolate shares", () => {
    expect(DB).toContain("export async function getCatalogVersion()");
    const fn = DB.slice(DB.indexOf("export async function getCatalogVersion()"));
    expect(fn.slice(0, 400)).toContain("readStoreRev()");
  });

  it("revalidates a cached snapshot against the durable revision", () => {
    // Without this a second isolate kept serving its own minute-old catalogue,
    // which no amount of client cache-busting could fix.
    const getStore = DB.slice(DB.indexOf("export async function getStore()"));
    expect(getStore.slice(0, 1200)).toContain("readStoreRev()");
    expect(getStore.slice(0, 1200)).toContain("storeCache = undefined");
  });
});
