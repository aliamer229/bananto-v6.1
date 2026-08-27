import { describe, expect, it, vi } from "vitest";

import {
  createProductsRequestGate,
  interpretProductsPayload,
  loadAdminProducts,
  productsRequestKey,
  LOAD_ATTEMPTS,
} from "./adminProductsLoad";

describe("interpretProductsPayload", () => {
  it("loads rows and carries D1's own total", () => {
    const verdict = interpretProductsPayload({
      success: true,
      items: [{ id: "prd_1", title: "Zelda", slug: "zelda" }],
      total: 42,
      page: 1,
      limit: 50,
      hasMore: false,
    });
    expect(verdict).toMatchObject({ state: "loaded", d1Count: 42, page: 1, limit: 50 });
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.products[0]!.titleEn).toBe("Zelda");
  });

  it("still reads the `products` key a page deployed before the rename sends", () => {
    const verdict = interpretProductsPayload({
      products: [{ id: "prd_1", title: "Zelda" }],
      d1Count: 1,
    });
    expect(verdict.state).toBe("loaded");
  });

  it("reports an empty catalogue only when D1 agrees it is empty", () => {
    expect(interpretProductsPayload({ items: [], total: 0 })).toMatchObject({ state: "empty" });
  });

  it("refuses an empty first page while D1 still reports products", () => {
    // The exact shape behind "عرض 0 من أصل 0 منتج مسجل في D1" on a full store.
    const verdict = interpretProductsPayload({ items: [], total: 137, page: 1 });
    expect(verdict.state).toBe("unusable");
    if (verdict.state !== "unusable") throw new Error("expected unusable");
    expect(verdict.reason).toContain("137");
  });

  it("accepts an empty page past the end of a paginated list", () => {
    // Page 9 of a two-page catalogue is legitimately empty; only page 1 is a
    // contradiction.
    expect(interpretProductsPayload({ items: [], total: 137, page: 9 })).toMatchObject({
      state: "empty",
    });
  });

  it("refuses rows that arrive without a total to paginate against", () => {
    const verdict = interpretProductsPayload({ items: [{ id: "a" }] });
    expect(verdict.state).toBe("unusable");
    if (verdict.state !== "unusable") throw new Error("expected unusable");
    expect(verdict.reason).toContain("total");
  });

  it("refuses a 200 that carries no products array, rather than settling on it", () => {
    // An auth redirect or a truncated body used to set no state at all, which
    // is what left the table spinning indefinitely.
    expect(interpretProductsPayload({ success: false, error: "unauthorized" })).toMatchObject({
      state: "unusable",
      reason: "unauthorized",
    });
    expect(interpretProductsPayload("<!doctype html>").state).toBe("unusable");
    expect(interpretProductsPayload(null).state).toBe("unusable");
  });

  it("keeps rows whose title is missing addressable by id", () => {
    const verdict = interpretProductsPayload({ items: [{ id: "prd_9" }, null, "junk"], total: 1 });
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.products).toHaveLength(1);
    expect(verdict.products[0]).toMatchObject({ id: "prd_9", title: "prd_9", slug: "prd_9" });
  });

  it("derives hasMore when the server does not state it", () => {
    const verdict = interpretProductsPayload({ items: [{ id: "a" }], total: 10, limit: 1 });
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.hasMore).toBe(true);
  });
});

describe("loadAdminProducts", () => {
  const attempt = (data: unknown, ok = true) => ({ ok, data, detail: "/api/admin/products — 200" });
  const noWait = async () => {};

  it("stops at the first believable response", async () => {
    const fetchJson = vi.fn(async () =>
      attempt({ items: [{ id: "prd_1", title: "Pro Controller" }], total: 1, page: 1, limit: 50 }),
    );
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(outcome).toMatchObject({ state: "loaded", d1Count: 1, attempts: 1 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("retries a response it cannot believe, then recovers", async () => {
    const fetchJson = vi
      .fn()
      // A 200 with no products array: the shape that used to be recorded as a
      // success and left the table spinning forever.
      .mockResolvedValueOnce(attempt({ success: false }))
      .mockResolvedValueOnce(attempt({ items: [{ id: "a" }], total: 1 }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(outcome).toMatchObject({ state: "loaded", attempts: 2 });
  });

  it("gives up after a bounded number of attempts and says why", async () => {
    const fetchJson = vi.fn(async () => ({
      ok: false,
      data: null,
      detail: '/api/admin/products — HTTP 500 — {"ref":"deadbeef"} — 41ms',
    }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(fetchJson).toHaveBeenCalledTimes(LOAD_ATTEMPTS);
    expect(outcome.state).toBe("failed");
    if (outcome.state !== "failed") throw new Error("expected failed");
    // The banner shows the path, the status and the server's own reference —
    // not "Store HTTP err, Products HTTP err".
    expect(outcome.detail).toContain("HTTP 500");
    expect(outcome.detail).toContain("deadbeef");
  });

  it("settles on empty without retrying when the server confirms an empty catalogue", async () => {
    const fetchJson = vi.fn(async () => attempt({ items: [], total: 0 }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(outcome).toMatchObject({ state: "empty", attempts: 1 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying an empty first page while D1 still reports products", async () => {
    const fetchJson = vi.fn(async () => attempt({ items: [], total: 137, page: 1 }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(fetchJson).toHaveBeenCalledTimes(LOAD_ATTEMPTS);
    expect(outcome.state).toBe("failed");
  });

  it("stops immediately when the page is left, and reports no verdict at all", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchJson = vi.fn(async () => attempt({ items: [], total: 0 }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: controller.signal,
      delay: noWait,
    });
    expect(outcome).toEqual({ state: "aborted" });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("always ends in a state — never leaves the caller without an answer", async () => {
    const cases: unknown[] = [
      null,
      "<!doctype html>",
      {},
      { items: "nope" },
      { total: 5 },
      { items: [{ id: "a" }] },
      { items: [], total: 0 },
    ];
    for (const payload of cases) {
      const outcome = await loadAdminProducts({
        fetchJson: async () => attempt(payload),
        path: "/api/admin/products",
        signal: new AbortController().signal,
        delay: noWait,
        attempts: 1,
      });
      expect(["loaded", "empty", "failed"]).toContain(outcome.state);
    }
  });
});

describe("request lifecycle", () => {
  it("gives the same question the same key, and different questions different keys", () => {
    const base = { page: 1, limit: 50, sort: "updated", dir: "desc", search: "" };
    expect(productsRequestKey(base)).toBe(productsRequestKey({ ...base }));
    expect(productsRequestKey({ ...base, search: "  Mario " })).toBe(
      productsRequestKey({ ...base, search: "mario" }),
    );
    for (const change of [
      { page: 2 },
      { limit: 100 },
      { sort: "price" },
      { dir: "asc" },
      { search: "zelda" },
    ]) {
      expect(productsRequestKey({ ...base, ...change })).not.toBe(productsRequestKey(base));
    }
  });

  it("collapses simultaneous duplicates into one request", async () => {
    const gate = createProductsRequestGate();
    let calls = 0;
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const load = async () => {
      calls++;
      await pending;
      return { state: "empty", d1Count: 0, page: 1, limit: 50, hasMore: false, attempts: 1 } as const;
    };

    const a = gate.run("k", load);
    const b = gate.run("k", load);
    expect(calls).toBe(1);
    release(undefined);
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it("does not collapse different questions", async () => {
    const gate = createProductsRequestGate();
    let calls = 0;
    const load = async () => {
      calls++;
      return { state: "empty", d1Count: 0, page: 1, limit: 50, hasMore: false, attempts: 1 } as const;
    };
    await Promise.all([gate.run("page-1", load), gate.run("page-2", load)]);
    expect(calls).toBe(2);
  });

  it("is not a cache — a retry after the request settles really re-asks", async () => {
    const gate = createProductsRequestGate();
    let calls = 0;
    const load = async () => {
      calls++;
      return { state: "failed", detail: "boom", attempts: 3 } as const;
    };
    await gate.run("k", load);
    await gate.run("k", load);
    expect(calls).toBe(2);
    expect(gate.size).toBe(0);
  });
});
