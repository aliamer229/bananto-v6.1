/**
 * @vitest-environment node
 *
 * Needs the real `node:sqlite`, which the default jsdom environment cannot load.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The catalogue writer, against a real database.
 *
 * What is under test is the SQL and the concurrency rule, not a mock of them: a
 * revision row whose primary key makes the second of two overlapping saves fail
 * instead of overwriting the first, and a loader that stitches chunked sections
 * back together. A mocked driver would happily "pass" a version of this that
 * loses one of two concurrent writes — which is precisely the bug.
 */
const db = new DatabaseSync(":memory:");

/** Statements the real batch helper would run in one transaction. */
function runBatch(statements: { sql: string; params: unknown[] }[]) {
  db.exec("BEGIN");
  try {
    for (const statement of statements) {
      db.prepare(statement.sql).run(...(statement.params as never[]));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return [{ success: true }];
}

vi.mock("./d1.server", () => ({
  d1Ready: async () => true,
  d1All: async (sql: string, ...binds: unknown[]) => db.prepare(sql).all(...(binds as never[])),
  d1First: async (sql: string, ...binds: unknown[]) => db.prepare(sql).get(...(binds as never[])),
  d1Run: async (sql: string, ...binds: unknown[]) => {
    db.prepare(sql).run(...(binds as never[]));
  },
  d1RunChanges: async (sql: string, ...binds: unknown[]) =>
    Number(db.prepare(sql).run(...(binds as never[])).changes ?? 0),
  d1BatchRun: async () => [],
  getD1: () => ({
    batch: (statements: { sql: string; params: unknown[] }[]) => runBatch(statements),
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({ sql, params }),
      sql,
      params: [] as unknown[],
    }),
  }),
  ensureSchema: async () => {},
  ensureUsersSchema: async () => {},
}));

/* The store module reaches for a few neighbours it does not need here. */
vi.mock("./storage.server", () => ({
  listKeys: async () => [],
  mutateJson: async () => undefined,
  readJson: async (_key: string, fallback: unknown) => fallback,
  writeJson: async () => undefined,
}));
vi.mock("./whatsapp.server", () => ({ sendWhatsappMessage: async () => undefined }));
vi.mock("./telegram.server", () => ({ sendTelegramMessage: async () => undefined }));

import { PRODUCT_INDEX_SCHEMA } from "@/test/sqlite-d1";

const store = await import("./db.server");

function reset() {
  db.exec(`DROP TABLE IF EXISTS store_kv`);
  db.exec(`DROP TABLE IF EXISTS store_rev`);
  db.exec(
    `CREATE TABLE store_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  db.exec(`CREATE TABLE store_rev (rev INTEGER PRIMARY KEY, updated_at TEXT NOT NULL)`);
  /* A price change fans out to members watching the product, so the writer
     reads the user table on its way through. Empty is enough. */
  db.exec(`DROP TABLE IF EXISTS users`);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT)`);
  /* The listing projection is written in the same batch as the catalogue, so
     the writer's transaction needs the table to exist. */
  db.exec(`DROP TABLE IF EXISTS product_index`);
  for (const statement of PRODUCT_INDEX_SCHEMA) db.exec(statement);
  store.invalidateStoreCache();
}

const product = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  titleEn: id,
  price: 1000,
  stock: 1,
  status: "نشط",
  categoryId: "cat_nintendo",
  ...over,
});

/** The catalogue as it actually sits in the database, not as cached. */
async function catalogueFromDb(): Promise<Record<string, any>[]> {
  store.invalidateStoreCache();
  return (await store.getStore()).products as unknown as Record<string, any>[];
}

const revCount = () =>
  Number((db.prepare(`SELECT COUNT(*) as n FROM store_rev`).get() as { n: number }).n);

beforeEach(reset);

describe("a product written is a product stored", () => {
  it("survives a reload from the database", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));

    const rows = await catalogueFromDb();
    expect(rows.map((p) => p.id)).toEqual(["prd_1"]);
  });

  it("keeps an edit to an existing product", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));
    await store.updateStore((current) => ({
      ...current,
      products: (current.products as never[]).map((p: any) =>
        p.id === "prd_1" ? { ...p, title: "Renamed", price: 42000 } : p,
      ) as never,
    }));

    const [saved] = await catalogueFromDb();
    expect(saved!.title).toBe("Renamed");
    expect(saved!.price).toBe(42000);
  });

  it("removes a deleted product from the database, not just from the response", async () => {
    await store.updateStore((current) => ({
      ...current,
      products: [product("prd_1"), product("prd_2")] as never,
    }));
    await store.updateStore((current) => ({
      ...current,
      products: (current.products as never[]).filter((p: any) => p.id !== "prd_1") as never,
    }));

    expect((await catalogueFromDb()).map((p) => p.id)).toEqual(["prd_2"]);
  });
});

describe("two saves that overlap", () => {
  /*
    The bug this file exists for: every save rewrites the whole catalogue from
    the snapshot it started with, so a writer holding an older snapshot erases
    whatever landed in between. Across isolates — each with its own read cache —
    that is an ordinary sequence of two admin saves, not a rare race.
  */
  it("keeps both products instead of the second erasing the first", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));

    // A second writer that began from the pre-`prd_1` catalogue. Its mutation
    // is re-applied to the newer one rather than overwriting it.
    await store.updateStore((current) => ({
      ...current,
      products: [...(current.products as never[]), product("prd_2")] as never,
    }));

    expect((await catalogueFromDb()).map((p) => p.id).sort()).toEqual(["prd_1", "prd_2"]);
  });

  it("does not resurrect a product deleted by the other writer", async () => {
    await store.updateStore((current) => ({
      ...current,
      products: [product("prd_1"), product("prd_2")] as never,
    }));
    await store.updateStore((current) => ({
      ...current,
      products: (current.products as never[]).filter((p: any) => p.id !== "prd_1") as never,
    }));

    // A save that starts from a stale copy still holding prd_1 must not bring
    // it back: the mutation is re-applied to the catalogue as it now is.
    await store.updateStore((current) => ({
      ...current,
      products: [...(current.products as never[]), product("prd_3")] as never,
    }));

    const ids = (await catalogueFromDb()).map((p) => p.id).sort();
    expect(ids).toEqual(["prd_2", "prd_3"]);
    expect(ids).not.toContain("prd_1");
  });

  it("keeps both when the two saves genuinely run at the same time", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("seed")] as never }));

    // Both start from the same revision; one loses the insert on the primary
    // key, re-reads, and re-applies its addition to the winner's catalogue.
    await Promise.all([
      store.updateStore((current) => ({
        ...current,
        products: [...(current.products as never[]), product("prd_a")] as never,
      })),
      store.updateStore((current) => ({
        ...current,
        products: [...(current.products as never[]), product("prd_b")] as never,
      })),
    ]);

    expect((await catalogueFromDb()).map((p) => p.id).sort()).toEqual(["prd_a", "prd_b", "seed"]);
  });

  it("advances the revision once per save and keeps a single row", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));
    await store.updateStore((current) => ({
      ...current,
      products: [product("prd_1"), product("prd_2")] as never,
    }));

    expect(revCount()).toBe(1);
    expect(
      Number((db.prepare(`SELECT MAX(rev) as rev FROM store_rev`).get() as { rev: number }).rev),
    ).toBe(2);
  });

  it("refuses a write whose revision has already been taken", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));

    // Somebody else claims the next revision first.
    const taken = Number(
      (db.prepare(`SELECT MAX(rev) as rev FROM store_rev`).get() as { rev: number }).rev,
    );
    expect(() =>
      db.prepare(`INSERT INTO store_rev (rev, updated_at) VALUES (?, ?)`).run(taken, "x"),
    ).toThrow();
  });
});

describe("a catalogue too big for one row", () => {
  it("round-trips through the chunked sections", async () => {
    // Comfortably past the 600 KB chunk limit.
    const many = Array.from({ length: 400 }, (_, i) =>
      product(`prd_${i}`, { description: "x".repeat(2000) }),
    );
    await store.updateStore((current) => ({ ...current, products: many as never }));

    const rows = await catalogueFromDb();
    expect(rows).toHaveLength(400);
    expect(rows[399]!.id).toBe("prd_399");

    const chunks = db
      .prepare(`SELECT key FROM store_kv WHERE key LIKE 'store:products#%'`)
      .all() as { key: string }[];
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("drops the leftover chunks when the catalogue shrinks again", async () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      product(`prd_${i}`, { description: "x".repeat(2000) }),
    );
    await store.updateStore((current) => ({ ...current, products: many as never }));
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));

    const chunks = db
      .prepare(`SELECT key FROM store_kv WHERE key LIKE 'store:products#%'`)
      .all() as { key: string }[];
    expect(chunks).toEqual([]);
    expect((await catalogueFromDb()).map((p) => p.id)).toEqual(["prd_1"]);
  });
});

describe("a section that will not parse", () => {
  it("refuses to load rather than reporting an empty catalogue", async () => {
    await store.updateStore((current) => ({ ...current, products: [product("prd_1")] as never }));

    db.prepare(`UPDATE store_kv SET value = ? WHERE key = 'store:products'`).run("{ broken json");
    store.invalidateStoreCache();

    /*
      Reading this as "no products" is what let the next save write that
      emptiness over the real catalogue.
    */
    await expect(store.getStore()).rejects.toThrow(/store_section_unreadable:products/);
  });
});
