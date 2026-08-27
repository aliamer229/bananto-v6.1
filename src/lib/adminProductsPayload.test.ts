import { describe, expect, it } from "vitest";

import {
  describeFailure,
  interpretProductsPayload,
  type AdminFetchResult,
} from "./adminProductsPayload";

const ok = (data: unknown): AdminFetchResult => ({
  ok: true,
  path: "/api/admin/products",
  status: 200,
  ms: 42,
  data,
});
const fail = (over: Partial<Extract<AdminFetchResult, { ok: false }>> = {}): AdminFetchResult => ({
  ok: false,
  path: "/api/admin/products",
  status: 500,
  ms: 42,
  reason: "HTTP 500",
  ...over,
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `لعبة ${id}`,
  titleEn: `Game ${id}`,
  slug: id,
  price: 10000,
  ...over,
});

describe("a response is only usable when it can be rendered truthfully", () => {
  it("renders a normal page", () => {
    const v = interpretProductsPayload(ok({ success: true, products: [row("a"), row("b")], d1Count: 2 }));
    expect(v.usable).toBe(true);
    expect(v.products).toHaveLength(2);
    expect(v.d1Count).toBe(2);
    expect(v.problem).toBe("");
  });

  it("accepts a genuinely empty catalogue", () => {
    // Zero rows and D1 agreeing there are zero is a real answer.
    const v = interpretProductsPayload(ok({ success: true, products: [], d1Count: 0 }));
    expect(v.usable).toBe(true);
    expect(v.products).toEqual([]);
  });

  it("refuses an empty page over a catalogue D1 says is full", () => {
    /*
      This is the screenshot: "عرض 0 من أصل 0 منتج مسجل في D1" over a database
      that has products in it. The old code called this loaded_empty.
    */
    const v = interpretProductsPayload(ok({ success: true, products: [], d1Count: 312 }));
    expect(v.usable).toBe(false);
    expect(v.d1Count).toBe(312);
    expect(v.problem).toContain("312");
    expect(v.problem).toContain("/api/admin/products");
  });

  it("refuses a 200 that carries no products array", () => {
    // The old loader set productsOk from res.ok, then fell through every branch
    // without touching state — leaving the table on its loading spinner.
    for (const body of [
      { success: false, error: "forbidden" },
      { products: null },
      {},
      null,
      "not json at all",
    ]) {
      const v = interpretProductsPayload(ok(body));
      expect(v.usable, JSON.stringify(body)).toBe(false);
      expect(v.problem).toContain("without a products array");
    }
  });

  it("refuses a failed request and names it", () => {
    const v = interpretProductsPayload(fail({ status: 403, reason: "HTTP 403", body: '{"error":"forbidden"}' }));
    expect(v.usable).toBe(false);
    expect(v.problem).toContain("HTTP 403");
    expect(v.problem).toContain("forbidden");
    expect(v.problem).toContain("42ms");
  });

  it("names a request that never got a response at all", () => {
    // The case that rendered as the bare string "Products HTTP err".
    const v = interpretProductsPayload(
      fail({ status: null, reason: "TypeError: Failed to fetch" }),
    );
    expect(v.usable).toBe(false);
    expect(v.problem).toContain("no response");
    expect(v.problem).toContain("Failed to fetch");
  });
});

describe("rows are normalised without losing anything", () => {
  it("fills a missing title from the English one and vice versa", () => {
    const v = interpretProductsPayload(
      ok({ products: [{ id: "x", titleEn: "Zelda" }, { id: "y", title: "زيلدا" }], d1Count: 2 }),
    );
    expect(v.products[0]!["title"]).toBe("Zelda");
    expect(v.products[1]!["titleEn"]).toBe("زيلدا");
  });

  it("falls back to the id when a row has no title at all", () => {
    const v = interpretProductsPayload(ok({ products: [{ id: "prd_9" }], d1Count: 1 }));
    expect(v.products[0]!["title"]).toBe("prd_9");
    expect(v.products[0]!["slug"]).toBe("prd_9");
  });

  it("keeps every other field, so nothing the table reads is dropped", () => {
    const v = interpretProductsPayload(
      ok({ products: [row("a", { stock: 5, updatedAt: "2026-01-01", cost: 900 })], d1Count: 1 }),
    );
    expect(v.products[0]!["stock"]).toBe(5);
    expect(v.products[0]!["updatedAt"]).toBe("2026-01-01");
  });

  it("drops rows that are not objects rather than rendering holes", () => {
    const v = interpretProductsPayload(ok({ products: [row("a"), null, "x", 7], d1Count: 4 }));
    expect(v.products).toHaveLength(1);
  });

  it("falls back to `total` when `d1Count` is absent", () => {
    const v = interpretProductsPayload(ok({ products: [row("a")], total: 88 }));
    expect(v.d1Count).toBe(88);
  });

  it("counts the rows themselves when neither is present", () => {
    const v = interpretProductsPayload(ok({ products: [row("a"), row("b")] }));
    expect(v.d1Count).toBe(2);
  });
});

describe("a failure is described well enough to match a server log", () => {
  it("does not repeat the status when the reason is only the status", () => {
    const text = describeFailure(fail({ status: 500, reason: "HTTP 500", ms: 12 }));
    expect(text).toBe("/api/admin/products — HTTP 500 (12ms)");
  });

  it("carries path, status, reason, body and timing", () => {
    const text = describeFailure(
      fail({ status: 500, reason: "HTTP 500", body: '{"ref":"err_7f3a"}', ms: 1873 }),
    );
    expect(text).toContain("/api/admin/products");
    expect(text).toContain("HTTP 500");
    expect(text).toContain("err_7f3a");
    expect(text).toContain("1873ms");
  });

  it("says so plainly when there was no response", () => {
    expect(describeFailure(fail({ status: null, reason: "AbortError: signal is aborted" })))
      .toContain("no response");
  });

  it("has nothing to say about a success", () => {
    expect(describeFailure(ok({ products: [] }))).toBe("");
  });
});

/**
 * Structural guarantees inside the loader, which lives in a 6,000-line
 * component and cannot be mounted in isolation here.
 */
describe("the loader cannot repeat the failures in the screenshot", () => {
  const read = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), "src/components/AdminDashboard.tsx"), "utf8");
  };

  it("no longer discards a store response's real status", async () => {
    const UI = await read();
    // `Store HTTP ${storeResponse?.status || "err"}` was the whole reason the
    // screen could only ever say "err": a non-OK store response was never
    // assigned, so its status was gone before it could be reported.
    expect(UI).not.toContain('storeResponse?.status || "err"');
    expect(UI).not.toContain('productsResponse?.status || "err"');
  });

  it("loads the store and the products independently", async () => {
    const UI = await read();
    // They shared one try block with the store parsed first, so a throw while
    // hydrating the store discarded a products response that had arrived.
    expect(UI).toContain("hydrateStore(store.data)");
    const loader = UI.slice(UI.indexOf("const loadFromDb = React.useCallback"));
    const hydrateCall = loader.indexOf("hydrateStore(store.data)");
    // The hydration is wrapped in its own try so it cannot reach the outer catch.
    expect(loader.slice(Math.max(0, hydrateCall - 120), hydrateCall)).toContain("try {");
  });

  it("renders the table when only the secondary store request failed", async () => {
    const UI = await read();
    const loader = UI.slice(UI.indexOf("const loadFromDb = React.useCallback"));
    // `productsOk` alone decides whether the table is shown; the store only
    // decides between "ok" and "partial".
    expect(loader).toContain('return "partial"');
    expect(loader).toMatch(/if \(productsOk\) \{/);
  });

  it("distinguishes an aborted attempt from a successful one", async () => {
    const UI = await read();
    // `if (signal.aborted) return true` reported an aborted attempt as success,
    // which stopped the retry loop with the status still on "loading" — the
    // spinner that never ends.
    expect(UI).not.toContain("if (signal.aborted) return true;");
    expect(UI).toContain('return "aborted"');
  });

  it("retries only real failures, and a bounded number of times", async () => {
    const UI = await read();
    expect(UI).toContain('if (outcome !== "failed") return;');
    expect(UI).toContain("attempt < 3");
  });

  it("cannot leave the screen on the loading spinner", async () => {
    const UI = await read();
    const loader = UI.slice(UI.indexOf("const loadFromDb = React.useCallback"));
    // Every terminal path sets a status, and the retry loop backstops it.
    expect(loader).toContain('setProductLoadStatus("failed")');
    expect(UI).toContain('if (!controller.signal.aborted) setProductLoadStatus("failed");');
  });

  it("clears the timeout and the listener on every path", async () => {
    const UI = await read();
    const loader = UI.slice(UI.indexOf("const loadFromDb = React.useCallback"));
    // Both were skipped on every success return, arming a 45-second abort and
    // leaking a listener for each attempt.
    const finallyAt = loader.indexOf("} finally {");
    expect(finallyAt).toBeGreaterThan(-1);
    const block = loader.slice(finallyAt, finallyAt + 260);
    expect(block).toContain("clearTimeout(timer)");
    expect(block).toContain('removeEventListener("abort", onOuterAbort)');
  });
});
