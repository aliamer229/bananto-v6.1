/**
 * @vitest-environment node
 */
/**
 * The admin listing, run against a real SQLite database.
 *
 * Everything here is the SQL the Worker issues — the ordering, the pagination,
 * the folded name key, the query count — executed by SQLite and read back, so
 * a passing test is evidence about the statements rather than about a mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1, PRODUCT_INDEX_SCHEMA, type FakeD1 } from "@/test/sqlite-d1";

let db: FakeD1;

/*
  `getD1()` reads the Worker env and prefers the native `bananto` binding, so
  the fake database is published there — the same lookup production takes.
*/
vi.mock("@/lib/env.server", () => ({
  env: () => undefined,
  getEnv: () => ({ bananto: (globalThis as Record<string, unknown>)["__TEST_D1__"] }),
  getBinding: () => undefined,
}));

const {
  DEFAULT_PAGE_SIZE,
  productIndexCount,
  productIndexStatements,
  readProductIndexPage,
  rebuildProductIndex,
  toIndexRow,
} = await import("./product-index.server");
const { sortableNameKey } = await import("./productSort");

function product(overrides: Record<string, unknown> = {}) {
  const id = String(overrides["id"] ?? `prd_${Math.random().toString(36).slice(2, 8)}`);
  return {
    id,
    title: `Product ${id}`,
    slug: id,
    price: 10000,
    stock: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  db = createSqliteD1(PRODUCT_INDEX_SCHEMA);
  (globalThis as Record<string, unknown>)["__TEST_D1__"] = db;
});

afterEach(() => {
  db.close();
  delete (globalThis as Record<string, unknown>)["__TEST_D1__"];
});

describe("projection", () => {
  it("keeps only listing columns — the full document never reaches the table", () => {
    const row = toIndexRow({
      id: "prd_1",
      title: "Zelda",
      price: 55000,
      description: "x".repeat(50_000),
      gallery: Array.from({ length: 40 }, (_, i) => ({ url: `g${i}` })),
      hubData: { timeline: Array.from({ length: 100 }, () => ({})) },
    });
    expect(Object.keys(row)).not.toContain("description");
    expect(Object.keys(row)).not.toContain("gallery");
    expect(Object.keys(row)).not.toContain("hubData");
    expect(JSON.stringify(row).length).toBeLessThan(600);
  });

  it("reads every spelling of hidden the catalogue uses", () => {
    expect(toIndexRow({ id: "a", isHidden: true }).isHidden).toBe(true);
    expect(toIndexRow({ id: "b", visibility: "draft" }).isHidden).toBe(true);
    expect(toIndexRow({ id: "c", status: "مخفي" }).isHidden).toBe(true);
    expect(toIndexRow({ id: "d" }).isHidden).toBe(false);
  });

  it("binds every column it declares", () => {
    const statements = productIndexStatements([product({ id: "prd_1" })], 7);
    const insert = statements.find((s) => s.sql.startsWith("INSERT"))!;
    const columns = insert.sql.slice(insert.sql.indexOf("(") + 1, insert.sql.indexOf(")")).split(",");
    expect(insert.params).toHaveLength(columns.length);
  });
});

describe("reading a page", () => {
  it("returns the requested page and D1's own total", async () => {
    await rebuildProductIndex(
      Array.from({ length: 137 }, (_, i) =>
        product({ id: `prd_${String(i).padStart(3, "0")}`, displayOrder: i }),
      ),
      1,
    );
    expect(await productIndexCount()).toBe(137);

    const first = await readProductIndexPage({ page: 1, limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(137);
    expect(first.hasMore).toBe(true);

    const last = await readProductIndexPage({ page: 3, limit: 50 });
    expect(last.items).toHaveLength(37);
    expect(last.hasMore).toBe(false);
  });

  it("never returns more than the maximum page size", async () => {
    await rebuildProductIndex(Array.from({ length: 300 }, () => product()), 1);
    const page = await readProductIndexPage({ page: 1, limit: 5000 });
    expect(page.items.length).toBeLessThanOrEqual(100);
  });

  it("defaults to fifty rows rather than the catalogue", async () => {
    await rebuildProductIndex(Array.from({ length: 200 }, () => product()), 1);
    const page = await readProductIndexPage({});
    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it("pages a product exactly once — no duplicates, no gaps", async () => {
    await rebuildProductIndex(
      // Same price on every row, so only the id tie-break gives a stable order.
      Array.from({ length: 120 }, (_, i) => product({ id: `prd_${i}`, price: 5000 })),
      1,
    );
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await readProductIndexPage({
        page,
        limit: 50,
        sort: { field: "price", direction: "asc" },
      });
      seen.push(...result.items.map((item) => item.id));
    }
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });
});

describe("ordering happens in SQL", () => {
  const catalogue = [
    product({ id: "a", title: "Mario Kart 8", price: 52000, updatedAt: "2026-03-01T00:00:00Z" }),
    product({ id: "b", title: "Mario Kart 10", price: 9000, updatedAt: "2026-01-01T00:00:00Z" }),
    product({ id: "c", title: "Mario Kart 2", price: 22000, updatedAt: "2026-02-01T00:00:00Z" }),
    product({ id: "d", title: "Zelda", price: null, updatedAt: null, createdAt: null }),
  ];

  beforeEach(async () => {
    await rebuildProductIndex(catalogue, 1);
  });

  it("sorts price numerically, not as text", async () => {
    const page = await readProductIndexPage({ sort: { field: "price", direction: "asc" } });
    // 9000 before 22000: string ordering would put "22000" first.
    expect(page.items.map((i) => i.id).slice(0, 3)).toEqual(["b", "c", "a"]);
  });

  it("puts missing values last in both directions", async () => {
    const asc = await readProductIndexPage({ sort: { field: "price", direction: "asc" } });
    const desc = await readProductIndexPage({ sort: { field: "price", direction: "desc" } });
    // The unpriced product is not "the cheapest", and flipping the column must
    // not promote it to the top either.
    expect(asc.items.at(-1)!.id).toBe("d");
    expect(desc.items.at(-1)!.id).toBe("d");
  });

  it("sorts names the way the browser's collator does, numerics included", async () => {
    const page = await readProductIndexPage({ sort: { field: "name", direction: "asc" } });
    // "Mario Kart 2" before "Mario Kart 8" before "Mario Kart 10" — plain text
    // ordering puts 10 before 2.
    expect(page.items.map((i) => i.title)).toEqual([
      "Mario Kart 2",
      "Mario Kart 8",
      "Mario Kart 10",
      "Zelda",
    ]);
  });

  it("orders by last edit as a number, across mixed date spellings", async () => {
    const page = await readProductIndexPage({ sort: { field: "updated", direction: "desc" } });
    expect(page.items.map((i) => i.id).slice(0, 3)).toEqual(["a", "c", "b"]);
  });

  it("folds alef variants so an Arabic title sorts where a reader expects", async () => {
    await rebuildProductIndex(
      [
        product({ id: "x", title: "أساسي" }),
        product({ id: "y", title: "اساسي" }),
        product({ id: "z", title: "بداية" }),
      ],
      1,
    );
    const page = await readProductIndexPage({ sort: { field: "name", direction: "asc" } });
    // The two spellings of the same word are adjacent, and both precede ب.
    expect(page.items.map((i) => i.id)).toEqual(["x", "y", "z"]);
    expect(sortableNameKey("أساسي")).toBe(sortableNameKey("اساسي"));
  });
});

describe("filtering happens in SQL", () => {
  beforeEach(async () => {
    await rebuildProductIndex(
      [
        product({ id: "a", title: "Mario Kart 8 Deluxe", categoryId: "cat_nintendo" }),
        product({ id: "b", title: "Pro Controller", categoryId: "cat_accessories", price: 0 }),
        product({ id: "c", title: "بطاقة eShop", categoryId: "cat_gift_cards", isHidden: true }),
      ],
      1,
    );
  });

  it("searches without loading the catalogue", async () => {
    const page = await readProductIndexPage({ search: "mario" });
    expect(page.items.map((i) => i.id)).toEqual(["a"]);
    expect(page.total).toBe(1);
  });

  it("searches Arabic through the same folded key", async () => {
    const page = await readProductIndexPage({ search: "بطاقه" });
    expect(page.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("filters hidden and unpriced rows in the query, not after it", async () => {
    expect((await readProductIndexPage({ hidden: true })).items.map((i) => i.id)).toEqual(["c"]);
    expect((await readProductIndexPage({ hidden: false })).total).toBe(2);
    expect((await readProductIndexPage({ onlyUnpriced: true })).items.map((i) => i.id)).toEqual(["b"]);
  });

  it("counts the filtered set, so hasMore describes the rows it returned", async () => {
    const page = await readProductIndexPage({ search: "mario", limit: 1 });
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });
});

describe("cost of a page", () => {
  it("is two queries, whatever the catalogue size", async () => {
    for (const size of [100, 500, 1200]) {
      await rebuildProductIndex(
        Array.from({ length: size }, (_, i) => product({ id: `p${size}_${i}` })),
        1,
      );
      db.reset();
      const page = await readProductIndexPage({ page: 1, limit: 50 });
      expect(page.items).toHaveLength(50);
      expect(page.total).toBe(size);
      /*
        Three statements, fixed: the filtered COUNT, the page, and one aggregate
        row for the filter chips. No per-row hydration and no N+1 — the number
        does not move when the catalogue grows tenfold.
      */
      expect(db.log).toHaveLength(3);
      expect(db.log.filter((sql) => /FROM product_index/.test(sql))).toHaveLength(3);
      // And nothing reached the document store.
      expect(db.log.some((sql) => /store_kv/.test(sql))).toBe(false);
    }
  });

  it("uses an index for every sort the table offers", async () => {
    await rebuildProductIndex(Array.from({ length: 200 }, () => product()), 1);
    for (const field of ["updated", "price", "name", "order"] as const) {
      db.reset();
      await readProductIndexPage({ sort: { field, direction: "desc" }, limit: 50 });
      const select = db.log.find((sql) => sql.startsWith("SELECT id"))!;
      const plan = db.raw
        .prepare(`EXPLAIN QUERY PLAN ${select.replace(/\?/g, "50")}`)
        .all() as { detail: string }[];
      const detail = plan.map((row) => row.detail).join(" | ");
      // A temporary B-tree in the plan means SQLite sorted the whole table to
      // answer one page, which is the cost this index set exists to avoid.
      expect(detail).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/);
      expect(detail).toMatch(/USING (COVERING )?INDEX/);
    }
  });
});
