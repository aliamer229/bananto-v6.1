/**
 * @vitest-environment node
 *
 * A delete, end to end, with nothing mocked out of the delete path.
 *
 * The regression this exists for: `hardDeleteProductRelations` ran
 * `DELETE FROM store_kv WHERE key = 'store:product:<id>'`, which is the
 * tombstone the delete had just written. That was safe only while the delete
 * *also* rewrote the aggregate to remove the product first; once it stopped
 * doing that, the cleanup put the product straight back and the post-delete
 * check reported `aggregate:id` — the exact production error.
 *
 * The suite stayed green because the cost test mocked
 * `hardDeleteProductRelations` away. So this one mocks nothing below the
 * delete: the real relation cleanup runs against a real database, and what is
 * asserted is what `getStore()` returns afterwards.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1, PRODUCT_INDEX_SCHEMA, type FakeD1 } from "@/test/sqlite-d1";

const fake: FakeD1 = createSqliteD1();

vi.mock("./d1.server", async () => {
  const actual = await vi.importActual<typeof import("./d1.server")>("./d1.server");
  const db = () => fake.raw;
  return {
    ...actual,
    d1Ready: async () => true,
    getD1: () => fake,
    d1All: async (sql: string, ...b: unknown[]) => db().prepare(sql).all(...(b as never[])),
    d1First: async (sql: string, ...b: unknown[]) =>
      db().prepare(sql).get(...(b as never[])) ?? undefined,
    d1Run: async (sql: string, ...b: unknown[]) => {
      db().prepare(sql).run(...(b as never[]));
    },
    d1RunChanges: async (sql: string, ...b: unknown[]) =>
      Number(db().prepare(sql).run(...(b as never[])).changes ?? 0),
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

/*
  Deliberately NOT mocked: product-identity.server (the relation cleanup that
  caused this) and devicePerformance.server. Only the transports above are.
*/
const { deleteProductEverywhere } = await import("./product-delete.server");
const { claimProductIdentity } = await import("./product-identity.server");
const store = await import("./db.server");

const RELATION_TABLES = [
  "product_identity",
  "game_catalog",
  "game_records",
  "game_device_performance",
  "game_device_performance_modes",
  "game_variants",
  "game_images",
  "game_aliases",
  "game_price_history",
  "game_import_logs",
];

function product(index: number) {
  return {
    id: `prd_${String(index).padStart(4, "0")}`,
    title: `Game ${index}`,
    titleEn: `Game ${index}`,
    slug: `game-${index}`,
    price: 20000 + index,
    stock: 2,
    status: "نشط",
    categoryId: "cat_nintendo",
    platform: "switch1",
  };
}

const CATALOGUE = 25;

function seed() {
  const db = fake.raw;
  for (const table of [...RELATION_TABLES, "store_kv", "store_rev", "product_index", "users"]) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.exec(`CREATE TABLE store_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE store_rev (rev INTEGER PRIMARY KEY, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT)`);
  db.exec(
    `CREATE TABLE product_identity (
       product_id TEXT PRIMARY KEY, normalized_title TEXT, platform TEXT,
       slug TEXT, title TEXT, updated_at TEXT
     )`,
  );
  db.exec(`CREATE TABLE game_catalog (id TEXT, game_id TEXT)`);
  db.exec(`CREATE TABLE game_records (game_id TEXT)`);
  db.exec(`CREATE TABLE game_device_performance (id TEXT, game_id TEXT)`);
  db.exec(`CREATE TABLE game_device_performance_modes (id TEXT, performance_id TEXT)`);
  for (const t of ["game_variants", "game_images", "game_aliases", "game_price_history", "game_import_logs"]) {
    db.exec(`CREATE TABLE ${t} (game_id TEXT)`);
  }
  for (const statement of PRODUCT_INDEX_SCHEMA) db.exec(statement);

  const products = Array.from({ length: CATALOGUE }, (_, i) => product(i));
  const insert = db.prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`);
  insert.run("store", JSON.stringify({ categories: [] }), "now");
  insert.run("store:products", JSON.stringify(products), "now");
  db.prepare(`INSERT INTO store_rev (rev, updated_at) VALUES (1, 'now')`).run();

  // Relations, so the cleanup has something real to remove.
  const idx = db.prepare(`INSERT INTO product_index (id, slug, title) VALUES (?, ?, ?)`);
  const identity = db.prepare(
    `INSERT INTO product_identity (product_id, normalized_title, platform, slug, title, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const p of products) {
    idx.run(p.id, p.slug, p.title);
    identity.run(p.id, p.title.toLowerCase(), p.platform, p.slug, p.title, "now");
    db.prepare(`INSERT INTO game_images (game_id) VALUES (?)`).run(p.id);
    db.prepare(`INSERT INTO game_variants (game_id) VALUES (?)`).run(p.id);
    db.prepare(`INSERT INTO game_device_performance (id, game_id) VALUES (?, ?)`).run(
      `gdp_${p.id}`,
      p.id,
    );
    db.prepare(
      `INSERT INTO game_device_performance_modes (id, performance_id) VALUES (?, ?)`,
    ).run(`mode_${p.id}`, `gdp_${p.id}`);
  }
  store.invalidateStoreCache();
}

const liveIds = async () =>
  ((await store.getStore()).products as { id: string }[]).map((p) => p.id);

beforeEach(seed);

describe("one delete, with the real relation cleanup", () => {
  it("leaves the product absent from the catalogue and reports ok", async () => {
    const result = await deleteProductEverywhere("prd_0007");

    // The exact production failure: ok=false with remaining=["aggregate:id"],
    // because the relation cleanup deleted the tombstone that was hiding it.
    expect(result.remaining).toEqual([]);
    expect(result.ok).toBe(true);

    store.invalidateStoreCache();
    expect(await liveIds()).not.toContain("prd_0007");
  });

  it("keeps it absent on a completely cold read", async () => {
    await deleteProductEverywhere("prd_0007");
    store.invalidateStoreCache();
    // Twice: the second read comes from a rebuilt snapshot, not the first read.
    expect(await liveIds()).not.toContain("prd_0007");
    store.invalidateStoreCache();
    expect(await liveIds()).not.toContain("prd_0007");
  });

  it("removes every relation row, and the listing projection", async () => {
    await deleteProductEverywhere("prd_0007");
    const db = fake.raw;
    for (const table of ["product_identity", "game_images", "game_variants"]) {
      const column = table === "product_identity" ? "product_id" : "game_id";
      const row = db.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${column} = ?`).get("prd_0007");
      expect(row, `${table} still holds the product`).toBeUndefined();
    }
    expect(
      db.prepare(`SELECT id FROM product_index WHERE id = ?`).get("prd_0007"),
    ).toBeUndefined();
    // Performance modes go with their parent performance row.
    expect(
      db
        .prepare(`SELECT id FROM game_device_performance_modes WHERE performance_id = ?`)
        .get("gdp_prd_0007"),
    ).toBeUndefined();
  });

  it("keeps the tombstone, because it is the only thing hiding the product", async () => {
    await deleteProductEverywhere("prd_0007");
    const row = fake.raw
      .prepare(`SELECT value FROM store_kv WHERE key = ?`)
      .get("store:product:prd_0007") as { value: string } | undefined;
    expect(row?.value, "the tombstone must survive relation cleanup").toBeDefined();
    expect(JSON.parse(row!.value)._deleted).toBe(true);
  });
});

describe("ten deletes, one after another", () => {
  it("every one of them stays gone", async () => {
    const deleted: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `prd_${String(i).padStart(4, "0")}`;
      const result = await deleteProductEverywhere(id);
      expect(result.remaining, `${id} survived`).toEqual([]);
      expect(result.ok).toBe(true);
      deleted.push(id);
    }

    store.invalidateStoreCache();
    const live = await liveIds();
    expect(live).toHaveLength(CATALOGUE - 10);
    for (const id of deleted) expect(live).not.toContain(id);
    // And nothing that should have survived was taken with them.
    expect(live).toContain("prd_0010");
    expect(live).toContain(`prd_${String(CATALOGUE - 1).padStart(4, "0")}`);
  });

  it("does not resurrect any of them when the aggregate is next rewritten", async () => {
    for (let i = 0; i < 10; i++) {
      await deleteProductEverywhere(`prd_${String(i).padStart(4, "0")}`);
    }
    // A real product save rewrites the aggregate and compacts the tombstones.
    await store.updateStore((current) => current);
    store.invalidateStoreCache();

    const live = await liveIds();
    expect(live).toHaveLength(CATALOGUE - 10);
    for (let i = 0; i < 10; i++) {
      expect(live).not.toContain(`prd_${String(i).padStart(4, "0")}`);
    }
    // The tombstones are gone too — nothing left to accumulate.
    const tombstones = fake.raw
      .prepare(`SELECT COUNT(*) AS n FROM store_kv WHERE key LIKE 'store:product:%'`)
      .get() as { n: number };
    expect(Number(tombstones.n)).toBe(0);
  });
});

describe("a deleted product's identity is free again", () => {
  it("lets the same title be added back", async () => {
    const original = product(7);
    await deleteProductEverywhere(original.id);

    // The identity row is what refuses a duplicate title. Deleting the product
    // must release it, or the title is refused forever by a holder nobody can
    // find in the catalogue.
    const claim = await claimProductIdentity({
      id: "prd_new_0001",
      title: original.title,
      titleEn: original.titleEn,
      platform: original.platform,
    });
    expect(claim.ok, `refused by ${JSON.stringify(claim)}`).toBe(true);
  });
});

describe("products left half-deleted by the broken release", () => {
  /*
    The shipped bug removed a product's relations, its identity claim and its
    listing row, then deleted the tombstone that was hiding it — so it came
    back into the catalogue with nothing left pointing at it. Deleting it again
    has to finish the job rather than fail differently.
  */
  function halfDelete(id: string) {
    const db = fake.raw;
    for (const [table, column] of [
      ["product_identity", "product_id"],
      ["game_images", "game_id"],
      ["game_variants", "game_id"],
    ] as const) {
      db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id);
    }
    db.prepare(`DELETE FROM product_index WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM store_kv WHERE key = ?`).run(`store:product:${id}`);
    store.invalidateStoreCache();
  }

  it("is exactly the state the screenshot showed", async () => {
    halfDelete("prd_0007");
    // Still in the catalogue, with no identity and no listing row behind it.
    expect(await liveIds()).toContain("prd_0007");
  });

  it("deleting again finishes it, with no special repair step", async () => {
    halfDelete("prd_0007");
    const result = await deleteProductEverywhere("prd_0007");
    expect(result.remaining).toEqual([]);
    expect(result.ok).toBe(true);
    store.invalidateStoreCache();
    expect(await liveIds()).not.toContain("prd_0007");
  });

  it("is idempotent — deleting an already-deleted product still reports ok", async () => {
    await deleteProductEverywhere("prd_0007");
    const again = await deleteProductEverywhere("prd_0007");
    expect(again.ok).toBe(true);
    expect(again.remaining).toEqual([]);
  });

  it("deleting a product that never existed does not report a survivor", async () => {
    const result = await deleteProductEverywhere("prd_never_existed");
    expect(result.ok).toBe(true);
  });
});
