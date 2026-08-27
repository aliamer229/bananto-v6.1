/**
 * @vitest-environment node
 *
 * Deleting products one after another, against a real database.
 *
 * The failure was not one slow delete: it was that each delete rewrote the
 * whole catalogue document and invalidated every cache, so the storefront
 * between two deletes always paid a cold read of ten megabytes. This measures
 * what a delete actually touches, and asserts that it stays a function of the
 * product — not of the catalogue.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1, PRODUCT_INDEX_SCHEMA, type FakeD1 } from "@/test/sqlite-d1";

/*
  The same harness the rest of the suite uses: real SQLite behind the D1
  binding, and D1's 100-variable ceiling enforced. Built once and re-seeded per
  test, because `db.server` resolves the binding at call time.
*/
const fake: FakeD1 = createSqliteD1();
const db = fake.raw;
/** Every statement the delete path runs, with the bytes it moved. */
let log: { sql: string; bytes: number }[] = [];

function record(sql: string, rows: unknown) {
  log.push({ sql: sql.replace(/\s+/g, " ").trim(), bytes: JSON.stringify(rows ?? "").length });
}

vi.mock("./d1.server", async () => {
  const actual = await vi.importActual<typeof import("./d1.server")>("./d1.server");
  const get = () => (globalThis as Record<string, unknown>)["__DELETE_TEST_D1__"] as FakeD1;
  return {
    ...actual,
    d1Ready: async () => true,
    getD1: () => get(),
    d1All: async (sql: string, ...binds: unknown[]) => {
      const rows = get().raw.prepare(sql).all(...(binds as never[]));
      record(sql, rows);
      return rows;
    },
    d1First: async (sql: string, ...binds: unknown[]) => {
      const row = get().raw.prepare(sql).get(...(binds as never[]));
      record(sql, row);
      return row ?? undefined;
    },
    d1Run: async (sql: string, ...binds: unknown[]) => {
      record(sql, null);
      get().raw.prepare(sql).run(...(binds as never[]));
    },
    d1RunChanges: async (sql: string, ...binds: unknown[]) => {
      record(sql, null);
      return Number(get().raw.prepare(sql).run(...(binds as never[])).changes ?? 0);
    },
    d1BatchRun: async () => [],
    ensureSchema: async () => {},
    ensureUsersSchema: async () => {},
  };
});
vi.mock("./storage.server", () => ({
  listKeys: async () => [],
  mutateJson: async () => undefined,
  readJson: async (_k: string, fallback: unknown) => fallback,
  writeJson: async () => undefined,
}));
vi.mock("./whatsapp.server", () => ({ sendWhatsappMessage: async () => undefined }));
vi.mock("./telegram.server", () => ({ sendTelegramMessage: async () => undefined }));
vi.mock("./devicePerformance.server", () => ({
  deactivateGameDevicePerformance: async () => {},
  syncGameDevicePerformance: async () => {},
}));
vi.mock("./product-identity.server", () => ({
  hardDeleteProductRelations: async () => {},
  releaseProductIdentity: async () => {},
  pruneOrphanProductIdentities: async () => [],
  reindexProductIdentities: async () => ({ indexed: 0, unindexed: 0 }),
  claimProductIdentityAgainstCatalogue: async () => {},
}));

const { deleteProductEverywhere } = await import("./product-delete.server");
const store = await import("./db.server");

/** A catalogue at the size where the old path started failing. */
function heavy(index: number) {
  return {
    id: `prd_${String(index).padStart(5, "0")}`,
    title: `Game ${index}`,
    titleEn: `Game ${index}`,
    slug: `game-${index}`,
    price: 20000 + index,
    stock: 2,
    status: "نشط",
    categoryId: "cat_nintendo",
    description: "و".repeat(4000),
    gallery: Array.from({ length: 24 }, (_, g) => ({ url: `https://cdn.test/${index}/${g}.webp` })),
  };
}

const CATALOGUE = 500;

function seed() {
  for (const table of ["store_kv", "store_rev", "product_index", "product_identity", "users"]) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.exec(`CREATE TABLE store_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE store_rev (rev INTEGER PRIMARY KEY, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE product_identity (product_id TEXT PRIMARY KEY)`);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT)`);
  for (const statement of PRODUCT_INDEX_SCHEMA) db.exec(statement);

  const products = JSON.stringify(Array.from({ length: CATALOGUE }, (_, i) => heavy(i)));
  const insert = db.prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`);
  insert.run("store", JSON.stringify({ categories: [] }), "now");
  const CHUNK = 400_000;
  insert.run("store:products", "", "now");
  for (let i = 0; i * CHUNK < products.length; i++) {
    insert.run(
      `store:products#${String(i + 1).padStart(3, "0")}`,
      products.slice(i * CHUNK, (i + 1) * CHUNK),
      "now",
    );
  }
  db.prepare(`INSERT INTO store_rev (rev, updated_at) VALUES (1, 'now')`).run();

  const indexInsert = db.prepare(
    `INSERT INTO product_index (id, slug, title, sort_updated) VALUES (?, ?, ?, ?)`,
  );
  for (let i = 0; i < CATALOGUE; i++) {
    indexInsert.run(`prd_${String(i).padStart(5, "0")}`, `game-${i}`, `Game ${i}`, i);
  }
  (globalThis as Record<string, unknown>)["__DELETE_TEST_D1__"] = fake;
  store.invalidateStoreCache();
  log = [];
}

beforeEach(seed);

describe("one delete", () => {
  it("never reads or writes the catalogue document", async () => {
    const result = await deleteProductEverywhere("prd_00007");
    expect(result.ok).toBe(true);

    const catalogueTouched = log.filter((entry) =>
      /store:products|LIKE 'store:%'|LIKE 'store:product/.test(entry.sql),
    );
    // Not one statement against the products chunks — neither read nor write.
    expect(catalogueTouched).toEqual([]);
    const bytes = log.reduce((n, entry) => n + entry.bytes, 0);
    expect(bytes).toBeLessThan(2000);
  });

  it("hides the product from every read, immediately", async () => {
    await deleteProductEverywhere("prd_00007");
    const products = (await store.getStore()).products as { id: string }[];
    expect(products.some((p) => p.id === "prd_00007")).toBe(false);
    // And it is gone from the admin listing projection.
    expect(db.prepare(`SELECT id FROM product_index WHERE id = ?`).get("prd_00007")).toBeUndefined();
  });

  it("moves the catalogue revision exactly once", async () => {
    const before = Number(
      (db.prepare(`SELECT MAX(rev) AS rev FROM store_rev`).get() as { rev: number }).rev,
    );
    const result = await deleteProductEverywhere("prd_00007");
    const after = Number(
      (db.prepare(`SELECT MAX(rev) AS rev FROM store_rev`).get() as { rev: number }).rev,
    );
    expect(after).toBe(before + 1);
    expect(result.catalogVersion).toBe(after);
    // A single row, not a growing table.
    expect(
      Number((db.prepare(`SELECT COUNT(*) AS n FROM store_rev`).get() as { n: number }).n),
    ).toBe(1);
  });
});

describe("twenty deletes, one after another", () => {
  it("costs the same per delete as the first one did", async () => {
    const perDelete: number[] = [];
    for (let i = 0; i < 20; i++) {
      log = [];
      const result = await deleteProductEverywhere(`prd_${String(i).padStart(5, "0")}`);
      expect(result.ok).toBe(true);
      perDelete.push(log.reduce((n, entry) => n + entry.bytes, 0));
    }

    console.log(
      `[delete-cost] deletes=20 bytes_first=${perDelete[0]} bytes_last=${perDelete.at(-1)}` +
        ` bytes_total=${perDelete.reduce((a, b) => a + b, 0)}` +
        ` catalogue_products=${CATALOGUE}`,
    );

    // Flat: the twentieth delete does not cost more than the first. The old
    // path grew with the catalogue *and* re-read it three times per delete.
    expect(perDelete.at(-1)!).toBeLessThanOrEqual(perDelete[0]! * 1.5);
    for (const bytes of perDelete) expect(bytes).toBeLessThan(2000);
  });

  it("leaves the storefront reading exactly the surviving products", async () => {
    for (let i = 0; i < 20; i++) {
      await deleteProductEverywhere(`prd_${String(i).padStart(5, "0")}`);
    }
    store.invalidateStoreCache();
    const products = (await store.getStore()).products as { id: string }[];
    expect(products).toHaveLength(CATALOGUE - 20);
    for (let i = 0; i < 20; i++) {
      expect(products.some((p) => p.id === `prd_${String(i).padStart(5, "0")}`)).toBe(false);
    }
    // And every survivor is still there.
    expect(products.some((p) => p.id === "prd_00020")).toBe(true);
    expect(products.some((p) => p.id === `prd_${String(CATALOGUE - 1).padStart(5, "0")}`)).toBe(true);
  });

  it("compacts its tombstones on the next catalogue save", async () => {
    for (let i = 0; i < 20; i++) {
      await deleteProductEverywhere(`prd_${String(i).padStart(5, "0")}`);
    }
    const tombstones = () =>
      Number(
        (
          db
            .prepare(`SELECT COUNT(*) AS n FROM store_kv WHERE key LIKE 'store:product:%'`)
            .get() as { n: number }
        ).n,
      );
    expect(tombstones()).toBe(20);

    // A real product save rewrites the aggregate, which already excludes them.
    await store.updateStore((current) => current);
    expect(tombstones()).toBe(0);

    store.invalidateStoreCache();
    const products = (await store.getStore()).products as { id: string }[];
    // Still gone — the aggregate no longer lists them, so nothing to hide.
    expect(products).toHaveLength(CATALOGUE - 20);
  });
});
