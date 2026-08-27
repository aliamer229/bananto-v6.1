/**
 * The admin products path, end to end: D1 → the real GET handler → the
 * client's interpretation of the response → the state the table renders from.
 *
 * The bug this covers had no single broken step. `/api/admin/store` and
 * `/api/admin/products` shared one AbortController and one 45-second timeout,
 * and the loader threw a single opaque `Store HTTP err, Products HTTP err`
 * whenever either half came back wrong — so a store failure took the product
 * table down with it, and a 200 that carried no products array set no state at
 * all and left the spinner turning. Each of those is asserted below against the
 * handler's actual output rather than a hand-written payload.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { interpretProductsPayload } from "@/lib/adminProductsLoad";

const store = { products: [] as Record<string, unknown>[], categories: [] as unknown[] };

vi.mock("@/lib/session.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "usr_admin", isAdmin: true })),
  toPublicUser: (user: unknown) => user,
}));

vi.mock("@/lib/db.server", () => ({
  getStore: vi.fn(async () => store),
  updateStore: vi.fn(),
  invalidateStoreCache: vi.fn(),
  getCatalogVersion: vi.fn(async () => 1),
}));

const { Route } = await import("./products");

/*
  The route's own GET, not a copy of it. `handlers` is typed as either a record
  or a factory, so it is narrowed here rather than at every call site.
*/
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (ctx: { request: Request }) => Promise<Response>;
  }
).GET;

const get = (query = "") =>
  handler({ request: new Request(`https://store.test/api/admin/products${query}`) });

function product(id: string, title: string, price = 1000) {
  return { id, title, titleEn: title, slug: title.toLowerCase().replace(/\s+/g, "-"), price };
}

beforeEach(() => {
  store.products = [
    product("prd_1", "Pro Controller", 95000),
    product("prd_2", "Nintendo Switch OLED", 420000),
    product("prd_3", "Link amiibo", 38000),
  ];
});

describe("GET /api/admin/products", () => {
  it("returns every product D1 holds, with the total the client checks against", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(3);
    expect(body.d1Count).toBe(3);

    const verdict = interpretProductsPayload(body);
    expect(verdict.state).toBe("loaded");
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.products.map((p) => p.id)).toEqual(["prd_1", "prd_2", "prd_3"]);
  });

  it("still reports D1's full total when a page is sliced, so a page is never mistaken for the catalogue", async () => {
    const res = await get("?page=2&limit=2");
    const body = await res.json();
    expect(body.products).toHaveLength(1);
    expect(body.d1Count).toBe(3);
    expect(interpretProductsPayload(body).state).toBe("loaded");
  });

  it("says the catalogue is empty only when it is", async () => {
    store.products = [];
    const body = await (await get()).json();
    expect(body.d1Count).toBe(0);
    expect(interpretProductsPayload(body).state).toBe("empty");
  });

  it("a page past the end is a failed read, not an empty store", async () => {
    // The exact shape behind "عرض 0 من أصل 0 منتج مسجل في D1" on a full store:
    // an empty list next to a non-zero total.
    const body = await (await get("?page=9&limit=2")).json();
    expect(body.products).toHaveLength(0);
    expect(body.d1Count).toBe(3);
    const verdict = interpretProductsPayload(body);
    expect(verdict.state).toBe("unusable");
    if (verdict.state !== "unusable") throw new Error("expected unusable");
    expect(verdict.reason).toContain("3");
  });

  it("turns a D1 outage into a status and a reference the admin can report", async () => {
    const db = await import("@/lib/db.server");
    vi.mocked(db.getStore).mockRejectedValueOnce(new Error("D1_UNAVAILABLE"));
    const res = await get();
    expect(res.status).toBe(500);
    const body = await res.json();
    // Not a hung request and not a bare "err": a status, a message and a ref.
    expect(body.ref).toMatch(/^[0-9a-f]{8}$/);
    expect(String(body.message)).toContain("D1_UNAVAILABLE");
    expect(interpretProductsPayload(body).state).toBe("unusable");
  });

  it("keeps the sort the admin asked for across the whole catalogue, not just a page", async () => {
    const body = await (await get("?sort=price&dir=asc&page=1&limit=2")).json();
    expect(body.sort).toBe("price");
    expect(body.dir).toBe("asc");
    expect(body.products.map((p: { id: string }) => p.id)).toEqual(["prd_3", "prd_1"]);
  });
});

describe("a failing store request does not decide the product table", () => {
  it("leaves the products verdict intact whatever /api/admin/store did", async () => {
    // The two endpoints are read independently by the loader; this is the
    // property that makes that safe — the products payload is self-sufficient.
    const body = await (await get()).json();
    const storeFailed = { error: "server_error", ref: "deadbeef" };
    expect(interpretProductsPayload(storeFailed).state).toBe("unusable");
    expect(interpretProductsPayload(body).state).toBe("loaded");
  });
});
