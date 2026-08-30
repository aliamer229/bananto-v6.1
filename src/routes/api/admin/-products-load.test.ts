/**
 * @vitest-environment node
 */
/**
 * The admin products path, end to end: D1 → the real GET handler → the client's
 * interpretation of the response → the state the table renders from.
 *
 * The database here is a real SQLite instance behind the D1 binding, so the
 * handler runs the statements it runs in production and this asserts what
 * SQLite actually returned — including that the listing never reads the
 * catalogue document.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1, PRODUCT_INDEX_SCHEMA, type FakeD1 } from "@/test/sqlite-d1";

let db: FakeD1;
/** What `getStore()` would return — only the bootstrap path may touch it. */
const store = { products: [] as Record<string, unknown>[], categories: [] as unknown[] };
let storeReads = 0;

vi.mock("@/lib/env.server", () => ({
  env: () => undefined,
  getEnv: () => ({ bananto: (globalThis as Record<string, unknown>)["__TEST_D1__"] }),
  getBinding: () => undefined,
}));

vi.mock("@/lib/session.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "usr_admin", isAdmin: true })),
  toPublicUser: (user: unknown) => user,
}));

vi.mock("@/lib/db.server", () => ({
  getStore: vi.fn(async () => {
    storeReads++;
    return store;
  }),
  updateStore: vi.fn(),
  invalidateStoreCache: vi.fn(),
  getCatalogVersion: vi.fn(async () => 1),
}));

const { Route } = await import("./products");
const { interpretProductsPayload } = await import("@/lib/adminProductsLoad");
const { rebuildProductIndex } = await import("@/lib/product-index.server");

const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (ctx: { request: Request }) => Promise<Response>;
  }
).GET;

const get = (query = "") =>
  handler({ request: new Request(`https://store.test/api/admin/products${query}`) });

function product(index: number, overrides: Record<string, unknown> = {}) {
  const id = `prd_${String(index).padStart(3, "0")}`;
  return {
    id,
    title: `Product ${String(index).padStart(3, "0")}`,
    titleEn: `Product ${String(index).padStart(3, "0")}`,
    slug: `product-${index}`,
    price: 1000 + index,
    displayOrder: index,
    updatedAt: new Date(1735689600000 + index * 1000).toISOString(),
    // Deliberately heavy: the listing must not carry any of this.
    description: "x".repeat(20_000),
    gallery: Array.from({ length: 20 }, (_, g) => ({ url: `g${g}` })),
    ...overrides,
  };
}

beforeEach(() => {
  db = createSqliteD1([
    ...PRODUCT_INDEX_SCHEMA,
    `CREATE TABLE IF NOT EXISTS store_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  ]);
  (globalThis as Record<string, unknown>)["__TEST_D1__"] = db;
  store.products = [];
  storeReads = 0;
});

afterEach(() => {
  db.close();
  delete (globalThis as Record<string, unknown>)["__TEST_D1__"];
});

describe("GET /api/admin/products — the listing", () => {
  it("answers from the projection without reading the catalogue at all", async () => {
    await rebuildProductIndex(
      Array.from({ length: 137 }, (_, i) => product(i)),
      1,
    );
    db.reset();

    const res = await get("?page=1&limit=50&sort=updated&dir=desc");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items).toHaveLength(50);
    expect(body.total).toBe(137);
    expect(body.source).toBe("product_index");
    // The whole point: no store document was loaded, and no store_kv row read.
    expect(storeReads).toBe(0);
    expect(db.log.some((sql) => /store_kv/.test(sql))).toBe(false);
    // A count, a page and the chip aggregates — three, regardless of size.
    expect(db.log.filter((sql) => /FROM product_index/.test(sql))).toHaveLength(3);
  });

  it("returns a listing row, not a product document", async () => {
    await rebuildProductIndex([product(1)], 1);
    const body = await (await get("?limit=50")).json();
    const row = body.items[0];
    expect(row.title).toBe("Product 001");
    expect(row.description).toBeUndefined();
    expect(row.gallery).toBeUndefined();
    // 50 heavy documents were over a megabyte; the page is a few kilobytes.
    expect(JSON.stringify(body).length).toBeLessThan(4000);
  });

  it("reports a total that describes the catalogue, not the page", async () => {
    await rebuildProductIndex(
      Array.from({ length: 120 }, (_, i) => product(i)),
      1,
    );
    const body = await (await get("?page=2&limit=50")).json();
    expect(body.items).toHaveLength(50);
    expect(body.total).toBe(120);
    expect(body.page).toBe(2);
    expect(body.hasMore).toBe(true);
    expect(interpretProductsPayload(body).state).toBe("loaded");
  });

  it("caps the page size a caller can ask for", async () => {
    await rebuildProductIndex(
      Array.from({ length: 300 }, (_, i) => product(i)),
      1,
    );
    const body = await (await get("?limit=100000")).json();
    expect(body.items.length).toBeLessThanOrEqual(100);
  });

  it("sorts and searches in SQL, on the whole catalogue rather than a page", async () => {
    await rebuildProductIndex(
      [
        product(1, { title: "Mario Kart 8", price: 52000 }),
        product(2, { title: "Mario Kart 10", price: 9000 }),
        product(3, { title: "Zelda", price: 22000 }),
      ],
      1,
    );
    const byPrice = await (await get("?sort=price&dir=asc&limit=2")).json();
    // The cheapest two of *three*, not the cheapest two of the first page.
    expect(byPrice.items.map((p: { price: number }) => p.price)).toEqual([9000, 22000]);
    expect(byPrice.total).toBe(3);

    const searched = await (await get("?search=mario")).json();
    expect(searched.total).toBe(2);
    expect(searched.items).toHaveLength(2);
  });

  it("says the catalogue is empty only when it is", async () => {
    const body = await (await get("")).json();
    expect(body.total).toBe(0);
    expect(interpretProductsPayload(body).state).toBe("empty");
  });

  it("builds the projection from the catalogue rows when it has never been built", async () => {
    /*
      A database that predates this table: the catalogue is in store_kv, the
      index is empty. The bootstrap reads the product rows only — never the
      whole store document, which is the read that used to time out.
    */
    const catalogue = Array.from({ length: 60 }, (_, i) => product(i));
    db.raw
      .prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`)
      .run("store:products", JSON.stringify(catalogue), "now");

    const first = await (await get("?limit=50")).json();
    expect(first.bootstrapped).toBe(true);
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(60);
    // The document resolver was never called.
    expect(storeReads).toBe(0);

    const second = await (await get("?limit=50")).json();
    expect(second.bootstrapped).toBe(false);
    expect(second.total).toBe(60);
  });

  it("stitches chunked catalogues and lets a per-product overlay win", async () => {
    const catalogue = Array.from({ length: 4 }, (_, i) => product(i));
    const json = JSON.stringify(catalogue);
    const half = Math.floor(json.length / 2);
    const insert = db.raw.prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`);
    insert.run("store:products#001", json.slice(0, half), "now");
    insert.run("store:products#002", json.slice(half), "now");
    // An edit saved as an overlay row, and a deletion.
    insert.run("store:product:prd_001", JSON.stringify({ ...product(1), title: "Renamed" }), "now");
    insert.run("store:product:prd_002", JSON.stringify({ id: "prd_002", _deleted: true }), "now");

    const body = await (await get("?limit=50&sort=name&dir=asc")).json();
    expect(body.total).toBe(3);
    expect(body.items.map((p: { title: string }) => p.title)).toContain("Renamed");
    expect(body.items.map((p: { id: string }) => p.id)).not.toContain("prd_002");
  });

  it("skips a product that will not parse instead of failing the whole listing", async () => {
    const insert = db.raw.prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`);
    insert.run("store:products", JSON.stringify([product(1), product(2)]), "now");
    insert.run("store:product:prd_broken", "{ not json", "now");

    const body = await (await get("?limit=50")).json();
    // The other two are still there — one malformed record does not cost the
    // admin the catalogue.
    expect(body.total).toBe(2);
  });

  it("does not mistake an empty filter result for an unbuilt index", async () => {
    await rebuildProductIndex([product(1)], 1);
    // A catalogue is present in store_kv, so a spurious bootstrap would show up
    // as extra statements against it.
    db.raw
      .prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`)
      .run("store:products", JSON.stringify([product(1)]), "now");

    for (const query of [
      "?search=nothingmatchesthis",
      "?hidden=1",
      "?unpriced=1",
      "?performance=1",
      "?category=cat_does_not_exist",
      "?page=9&limit=50",
    ]) {
      db.reset();
      const body = await (await get(query)).json();
      expect(body.bootstrapped).toBe(false);
      // A filter with no hits is an answer, not a reason to reload the
      // catalogue — three statements, none of them against store_kv.
      expect(db.log).toHaveLength(3);
      expect(db.log.some((sql) => /store_kv/.test(sql))).toBe(false);
    }
  });

  it("repairs a known gift-card category when an older projection omitted it", async () => {
    await rebuildProductIndex([product(1)], 1);
    const giftCard = product(2, {
      categoryId: "legacy_custom_cards",
      category: "legacy_custom_cards",
      schemaId: "gift_card",
      kind: "digital_code",
      title: "Nintendo eShop $20",
    });
    db.raw
      .prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`)
      .run("store:products", JSON.stringify([product(1), giftCard]), "now");

    const body = await (await get("?category=cat_gift_cards")).json();
    expect(body.bootstrapped).toBe(true);
    expect(body.total).toBe(1);
    expect(body.items.map((entry: { id: string }) => entry.id)).toEqual(["prd_002"]);
  });

  it("carries stage timings a slow request can be diagnosed from", async () => {
    await rebuildProductIndex([product(1)], 1);
    const res = await get("");
    expect(res.headers.get("server-timing")).toMatch(/auth;dur=\d+/);
    expect(res.headers.get("server-timing")).toMatch(/query;dur=\d+/);
  });
});

describe("GET /api/admin/products — a single product", () => {
  it("reads the full document, which the listing never does", async () => {
    store.products = [product(1)];
    const body = await (await get("?id=prd_001")).json();
    expect(body.product.description).toHaveLength(20_000);
    expect(storeReads).toBe(1);
  });

  it("404s a product that does not exist", async () => {
    store.products = [product(1)];
    const res = await get("?id=prd_missing");
    expect(res.status).toBe(404);
  });
});

describe("a failing store request does not decide the product table", () => {
  it("leaves the listing intact whatever /api/admin/store did", async () => {
    await rebuildProductIndex([product(1)], 1);
    const body = await (await get("")).json();
    const storeFailed = { error: "server_error", ref: "deadbeef" };
    expect(interpretProductsPayload(storeFailed).state).toBe("unusable");
    expect(interpretProductsPayload(body).state).toBe("loaded");
    // The two endpoints no longer share a read: the listing never called it.
    expect(storeReads).toBe(0);
  });
});

describe("acceptance: the requests the admin page actually makes", () => {
  /*
    Run against a database that rejects >100 bound variables exactly as D1 does,
    at a catalogue size well past where the old statement broke. Each case is
    one of the requests the products page issues.
  */
  const CATALOGUE = 1000;

  beforeEach(async () => {
    await rebuildProductIndex(
      Array.from({ length: CATALOGUE }, (_, i) => product(i)),
      1,
    );
  });

  const cases: [string, string][] = [
    ["initial load", "?sort=updated&dir=desc&page=1&limit=50"],
    ["page two", "?sort=updated&dir=desc&page=2&limit=50"],
    ["back to page one", "?sort=updated&dir=desc&page=1&limit=50"],
    ["last page", "?sort=updated&dir=desc&page=20&limit=50"],
    ["sort by name", "?sort=name&dir=asc&page=1&limit=50"],
    ["sort by price", "?sort=price&dir=desc&page=1&limit=50"],
    ["default order", "?sort=order&dir=desc&page=1&limit=50"],
    ["search", "?search=Product%20007&page=1&limit=50"],
    ["hidden filter", "?hidden=1&page=1&limit=50"],
    ["unpriced filter", "?unpriced=1&page=1&limit=50"],
    [
      "every filter at once",
      "?search=product&hidden=0&unpriced=0&performance=1&sort=price&dir=asc&page=1&limit=50",
    ],
  ];

  it.each(cases)("%s answers 200 with a valid page", async (_label, query) => {
    db.reset();
    const res = await get(query);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(50);
    expect(Number.isFinite(body.total)).toBe(true);
    expect(Number.isFinite(body.page)).toBe(true);
    expect(body.limit).toBe(50);
    expect(typeof body.hasMore).toBe("boolean");
    expect(interpretProductsPayload(body).state).not.toBe("unusable");

    // Three statements, and none of them near the ceiling.
    expect(db.log).toHaveLength(3);
    for (const sql of db.log) {
      expect((sql.match(/\?/g) ?? []).length).toBeLessThan(12);
    }
  });

  it("pages the whole catalogue without a duplicate or a gap", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= CATALOGUE / 50; page++) {
      const body = await (await get(`?sort=name&dir=asc&page=${page}&limit=50`)).json();
      seen.push(...body.items.map((row: { id: string }) => row.id));
    }
    expect(seen).toHaveLength(CATALOGUE);
    expect(new Set(seen).size).toBe(CATALOGUE);
  });

  it("reports the catalogue total on every page, not the page length", async () => {
    for (const page of [1, 7, 20]) {
      const body = await (await get(`?page=${page}&limit=50`)).json();
      expect(body.total).toBe(CATALOGUE);
    }
  });
});
