import { describe, expect, it, vi } from "vitest";

import {
  interpretProductsPayload,
  loadAdminProducts,
  LOAD_ATTEMPTS,
} from "./adminProductsLoad";

describe("interpretProductsPayload", () => {
  it("loads rows and carries D1's own total", () => {
    const verdict = interpretProductsPayload({
      success: true,
      products: [{ id: "prd_1", title: "Zelda", slug: "zelda" }],
      d1Count: 42,
    });
    expect(verdict).toMatchObject({ state: "loaded", d1Count: 42 });
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.products[0]!.titleEn).toBe("Zelda");
  });

  it("reports an empty catalogue only when D1 agrees it is empty", () => {
    expect(interpretProductsPayload({ products: [], d1Count: 0 })).toMatchObject({
      state: "empty",
    });
  });

  it("refuses an empty page while D1 still reports products", () => {
    // The exact shape behind "عرض 0 من أصل 0 منتج مسجل في D1" on a full store.
    const verdict = interpretProductsPayload({ success: true, products: [], d1Count: 137 });
    expect(verdict.state).toBe("unusable");
    if (verdict.state !== "unusable") throw new Error("expected unusable");
    expect(verdict.reason).toContain("137");
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
    const verdict = interpretProductsPayload({ products: [{ id: "prd_9" }, null, "junk"] });
    if (verdict.state !== "loaded") throw new Error("expected loaded");
    expect(verdict.products).toHaveLength(1);
    expect(verdict.products[0]).toMatchObject({ id: "prd_9", title: "prd_9", slug: "prd_9" });
  });

  it("falls back to the page length when the server sends no d1Count", () => {
    const verdict = interpretProductsPayload({ products: [{ id: "a" }, { id: "b" }] });
    expect(verdict).toMatchObject({ state: "loaded", d1Count: 2 });
  });
});

describe("loadAdminProducts", () => {
  const attempt = (data: unknown, ok = true) => ({ ok, data, detail: "/api/admin/products — 200" });
  const noWait = async () => {};

  it("stops at the first believable response", async () => {
    const fetchJson = vi.fn(async () =>
      attempt({ products: [{ id: "prd_1", title: "Pro Controller" }], d1Count: 1 }),
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
      .mockResolvedValueOnce(attempt({ products: [{ id: "a" }], d1Count: 1 }));
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
      detail: "/api/admin/products — HTTP 500 — {\"ref\":\"deadbeef\"} — 41ms",
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
    const fetchJson = vi.fn(async () => attempt({ products: [], d1Count: 0 }));
    const outcome = await loadAdminProducts({
      fetchJson,
      path: "/api/admin/products",
      signal: new AbortController().signal,
      delay: noWait,
    });
    expect(outcome).toMatchObject({ state: "empty", attempts: 1 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying an empty page while D1 still reports products", async () => {
    const fetchJson = vi.fn(async () => attempt({ products: [], d1Count: 137 }));
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
    const fetchJson = vi.fn(async () => attempt({ products: [] }));
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
    const cases: unknown[] = [null, "<!doctype html>", {}, { products: "nope" }, { d1Count: 5 }];
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
