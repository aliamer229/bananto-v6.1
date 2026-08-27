/**
 * @vitest-environment node
 */
/**
 * What each endpoint reads, against the same seeded database.
 *
 * The twenty-second stall was never a timeout that needed raising: both admin
 * endpoints called `getStore()`, and `getStore()` reads every `store:*` row —
 * the whole catalogue as text — then stitches the chunks, parses megabytes,
 * validates and normalises every product, and merges the per-product overlays.
 * This measures that, then measures what the two endpoints read now.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
const readSql: string[] = [];

vi.mock("./d1.server", () => ({
  d1Ready: async () => true,
  d1All: async (sql: string, ...binds: unknown[]) => {
    readSql.push(sql.replace(/\s+/g, " ").trim());
    return db.prepare(sql).all(...(binds as never[]));
  },
  d1First: async (sql: string, ...binds: unknown[]) => db.prepare(sql).get(...(binds as never[])),
  d1Run: async () => {},
  d1RunChanges: async () => 0,
  d1BatchRun: async () => [],
  /*
    `d1Ready()` lives in db.server and gates the D1 path on `getD1()` being
    present, so this has to be truthy or the loader silently falls back to the
    JSON driver and every measurement below reads an empty store.
  */
  getD1: () => ({ prepare: (sql: string) => db.prepare(sql) }),
  ensureSchema: async () => {},
  ensureUsersSchema: async () => {},
}));
vi.mock("./storage.server", () => ({
  listKeys: async () => [],
  mutateJson: async () => undefined,
  readJson: async (_key: string, fallback: unknown) => fallback,
  writeJson: async () => undefined,
}));
vi.mock("./whatsapp.server", () => ({ sendWhatsappMessage: async () => undefined }));
vi.mock("./telegram.server", () => ({ sendTelegramMessage: async () => undefined }));

const store = await import("./db.server");

/** A product the size the catalogue actually carries. */
function heavy(index: number) {
  return {
    id: `prd_${String(index).padStart(5, "0")}`,
    title: `Game ${index}`,
    titleEn: `Game ${index}`,
    slug: `game-${index}`,
    price: 20000 + index,
    stock: 3,
    status: "نشط",
    categoryId: "cat_nintendo",
    displayOrder: index,
    updatedAt: new Date(1735689600000 + index * 1000).toISOString(),
    description: "و".repeat(4000),
    gallery: Array.from({ length: 24 }, (_, g) => ({ url: `https://cdn.test/${index}/${g}.webp` })),
    hubData: { timeline: Array.from({ length: 30 }, () => ({ note: "z".repeat(160) })) },
  };
}

function seed(count: number) {
  db.exec(`DROP TABLE IF EXISTS store_kv`);
  db.exec(`DROP TABLE IF EXISTS store_rev`);
  db.exec(`CREATE TABLE store_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE store_rev (rev INTEGER PRIMARY KEY, updated_at TEXT NOT NULL)`);
  const insert = db.prepare(`INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)`);

  const products = JSON.stringify(Array.from({ length: count }, (_, i) => heavy(i)));
  // Chunked exactly as persistStore writes it: 400 KB per row.
  const CHUNK = 400_000;
  insert.run("store", JSON.stringify({ categories: [{ id: "cat_nintendo", title: "ألعاب" }] }), "now");
  if (products.length <= CHUNK) {
    insert.run("store:products", products, "now");
  } else {
    insert.run("store:products", "", "now");
    for (let i = 0; i * CHUNK < products.length; i++) {
      insert.run(
        `store:products#${String(i + 1).padStart(3, "0")}`,
        products.slice(i * CHUNK, (i + 1) * CHUNK),
        "now",
      );
    }
  }
  insert.run("store:banners", JSON.stringify([]), "now");
  insert.run("store:bundles", JSON.stringify([]), "now");
  insert.run("store:content", JSON.stringify({}), "now");
  insert.run("store_rev_placeholder", "0", "now");
  db.prepare(`INSERT INTO store_rev (rev, updated_at) VALUES (1, 'now')`).run();

  store.invalidateStoreCache();
  readSql.length = 0;
  return products.length;
}

beforeEach(() => {
  store.invalidateStoreCache();
});

describe("what the admin endpoints read", () => {
  for (const count of [100, 500, 1000]) {
    it(`at ${count} products`, async () => {
      const catalogueBytes = seed(count);

      const fullStart = performance.now();
      const full = await store.getStore();
      const fullMs = performance.now() - fullStart;
      const fullRows = readSql.length;

      store.invalidateStoreCache();
      readSql.length = 0;

      const metaStart = performance.now();
      const meta = await store.getStoreMeta();
      const metaMs = performance.now() - metaStart;

      // How many bytes each read actually pulled out of store_kv.
      const bytesFor = (sql: string) =>
        (db.prepare(sql).all() as { value: string }[]).reduce((n, r) => n + r.value.length, 0);
      const allBytes = bytesFor(
        `SELECT value FROM store_kv WHERE key = 'store' OR key LIKE 'store:%' OR key LIKE 'analytics:%'`,
      );
      const metaBytes = bytesFor(
        `SELECT value FROM store_kv WHERE (key = 'store' OR key LIKE 'store:%' OR key LIKE 'analytics:%')
           AND key NOT LIKE 'store:product:%' AND key <> 'store:products' AND key NOT LIKE 'store:products#%'`,
      );

      console.log(
        `[read-cost] products=${count} catalogue_bytes=${catalogueBytes}` +
          ` getStore: rows_transferred_bytes=${allBytes} ms=${fullMs.toFixed(1)} queries=${fullRows}` +
          ` | getStoreMeta: rows_transferred_bytes=${metaBytes} ms=${metaMs.toFixed(1)}` +
          ` | reduction=${(1 - metaBytes / allBytes).toFixed(4)}`,
      );

      expect(full.products).toHaveLength(count);
      // The metadata read carries the categories and none of the catalogue.
      expect(meta.categories).toHaveLength(1);
      expect(meta.products).toHaveLength(0);
      // Better than a thousandth of the payload, at every size.
      expect(metaBytes * 1000).toBeLessThan(allBytes);
    });
  }
});
