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
  it("tombstones first, then clears the mirrors, then verifies", () => {
    const tombstone = OWNER.indexOf("await writeTombstone(id)");
    const relations = OWNER.indexOf("await hardDeleteProductRelations(id)");
    const index = OWNER.indexOf("DELETE FROM product_index WHERE id = ?");
    const verify = OWNER.lastIndexOf("findRemainingProductRepresentations(id, slug)");

    // The tombstone is what hides the product; nothing may run before it.
    expect(tombstone).toBeGreaterThan(-1);
    expect(relations).toBeGreaterThan(tombstone);
    expect(index).toBeGreaterThan(tombstone);
    expect(verify).toBeGreaterThan(relations);
    expect(verify).toBeGreaterThan(index);
  });

  it("aborts when the tombstone cannot be written", () => {
    // Without it nothing hides the product, so continuing would clear its
    // relations while leaving it visible — worse than not deleting at all.
    const branch = OWNER.slice(
      OWNER.indexOf("catch (err) {", OWNER.indexOf("await writeTombstone(id)")),
    );
    expect(branch.slice(0, 600)).toContain("return { ok: false");
  });

  it("does not rewrite the catalogue to delete one product", () => {
    /*
      The regression this guards: `updateStore` here meant a full uncached read
      of the catalogue document and a full rewrite of every products chunk, per
      delete, with two more full reads around it. Ten sequential deletes was
      thirty catalogue loads — which is what made the storefront hang.
    */
    expect(OWNER).not.toContain("updateStore(");
    expect(OWNER).not.toMatch(/await getStore\(\)/);
    expect(OWNER).toContain("bumpCatalogVersion()");
  });

  it("moves the catalogue revision so every cache key changes at once", () => {
    // One version bump, not a sweep of individual cache entries.
    expect(OWNER).toContain("catalogVersion");
    expect(OWNER.match(/bumpCatalogVersion\(\)/g) ?? []).toHaveLength(1);
  });
});

describe("verification covers every representation a product lives in", () => {
  it("names every representation it checks", () => {
    for (const needle of [
      '"aggregate:id"',
      '"store_kv:granular"',
      '"d1:product_identity"',
      '"public:listing"',
    ]) {
      expect(OWNER).toContain(needle);
    }
  });

  it("verifies with indexed row reads, not a catalogue load", () => {
    expect(OWNER).toContain("FROM store_kv WHERE key = ?");
    expect(OWNER).toContain("FROM product_identity WHERE product_id = ?");
    expect(OWNER).toContain("FROM product_index WHERE id = ?");
    // Confirming a delete by reading the whole catalogue — right after
    // invalidating its cache — was most of the cost of deleting a product.
    const verifier = OWNER.slice(
      OWNER.indexOf("export async function findRemainingProductRepresentations"),
      OWNER.indexOf("/** Writes the `_deleted` marker"),
    )
      // Comments explain what it *used* to do; the code is what is asserted.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(verifier).not.toContain("getStore(");
  });

  it("does not count a tombstone as a surviving product", () => {
    expect(OWNER).toContain("_deleted");
    expect(OWNER).toMatch(/A tombstone is not a survivor/);
  });
});

describe("the tombstone outlives the relation cleanup", () => {
  it("relation cleanup does not delete the granular store_kv row", () => {
    /*
      `store:product:<id>` is not a relation — it is the tombstone, and while it
      exists every read removes the product from the aggregate. Deleting it in
      the relation cleanup was safe only while the delete also rewrote the
      aggregate first; once it stopped doing that, this line put the product
      straight back and the post-delete check reported `aggregate:id`.
    */
    const cleanup = IDENTITY.slice(
      IDENTITY.indexOf("export async function hardDeleteProductRelations"),
    ).slice(0, 2000);
    expect(cleanup).not.toMatch(/DELETE FROM store_kv/);
  });

  it("the delete flow keeps the tombstone until compaction", () => {
    // Nothing between writing it and returning may remove it.
    const afterTombstone = OWNER.slice(OWNER.indexOf("await writeTombstone(id)"));
    expect(afterTombstone).not.toMatch(/DELETE FROM store_kv WHERE key = \?/);
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
