import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishEnv } from "./env.server";

/**
 * Accounts prepared in bulk must reach the buyer strictly one at a time: the
 * next one only after the previous is registered. Handing over several at once
 * defeats the point, and handing the same one twice is worse — two buyers could
 * end up on one account.
 */

/** In-memory stand-in for the single table this module owns. */
function stubD1() {
  const rows: Record<string, any>[] = [];
  const statements: string[] = [];

  const run = (sql: string, binds: unknown[]) => {
    statements.push(sql);
    const s = sql.replace(/\s+/g, " ").trim();

    if (/^CREATE/i.test(s)) return { changes: 0, results: [] };

    if (/^INSERT INTO order_account_batch/i.test(s)) {
      const [id, order_id, item_id, seq, email, password_enc, created_at] = binds as any[];
      rows.push({
        id,
        order_id,
        item_id,
        seq,
        email,
        password_enc,
        status: "staged",
        sent_at: null,
        registered_at: null,
        created_at,
      });
      return { changes: 1, results: [] };
    }

    if (/^SELECT MAX\(seq\)/i.test(s)) {
      const [order_id, item_id] = binds as any[];
      const mine = rows.filter((r) => r.order_id === order_id && r.item_id === item_id);
      return {
        changes: 0,
        results: [{ seq: mine.length ? Math.max(...mine.map((r) => r.seq)) : null }],
      };
    }

    if (
      /^SELECT id FROM order_account_batch WHERE order_id = \? AND item_id = \? AND status = 'sent'/i.test(
        s,
      )
    ) {
      const [order_id, item_id] = binds as any[];
      const hit = rows.find(
        (r) => r.order_id === order_id && r.item_id === item_id && r.status === "sent",
      );
      return { changes: 0, results: hit ? [{ id: hit.id }] : [] };
    }

    if (/^SELECT id, seq, email, password_enc/i.test(s)) {
      const [order_id, item_id] = binds as any[];
      const hit = rows
        .filter((r) => r.order_id === order_id && r.item_id === item_id && r.status === "staged")
        .sort((a, b) => a.seq - b.seq)[0];
      return { changes: 0, results: hit ? [hit] : [] };
    }

    if (/^UPDATE order_account_batch SET status = 'sent'/i.test(s)) {
      const [sent_at, id] = binds as any[];
      const row = rows.find((r) => r.id === id && r.status === "staged");
      if (!row) return { changes: 0, results: [] };
      row.status = "sent";
      row.sent_at = sent_at;
      return { changes: 1, results: [] };
    }

    if (/^UPDATE order_account_batch SET status = 'registered'/i.test(s)) {
      const [registered_at, order_id, item_id] = binds as any[];
      const row = rows
        .filter((r) => r.order_id === order_id && r.item_id === item_id && r.status === "sent")
        .sort((a, b) => a.seq - b.seq)[0];
      if (!row) return { changes: 0, results: [] };
      row.status = "registered";
      row.registered_at = registered_at;
      return { changes: 1, results: [] };
    }

    if (/^SELECT id, seq, email, status/i.test(s)) {
      const [order_id, item_id] = binds as any[];
      return {
        changes: 0,
        results: rows
          .filter((r) => r.order_id === order_id && r.item_id === item_id)
          .sort((a, b) => a.seq - b.seq),
      };
    }

    return { changes: 0, results: [] };
  };

  const prepare = (sql: string, binds: unknown[] = []): any => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    all: async () => ({ results: run(sql, binds).results }),
    first: async () => run(sql, binds).results[0] ?? null,
    run: async () => {
      const out = run(sql, binds);
      return { success: true, meta: { changes: out.changes }, results: out.results };
    },
  });

  return { rows, statements, db: { prepare: (sql: string) => prepare(sql) } };
}

const ORDER = "ord_1";
const ITEM = "itm_1";

let stub: ReturnType<typeof stubD1>;

beforeEach(async () => {
  vi.resetModules();
  stub = stubD1();
  publishEnv({
    bananto: stub.db,
    SESSION_SECRET: "test-session-secret-0123456789abcdef",
    ACCOUNT_ENC_KEY: "test-account-encryption-key-0123456789",
  });
});

afterEach(() => publishEnv({}));

async function mod() {
  return import("./account-batch.server");
}

describe("bulk account preparation", () => {
  it("stages a batch and numbers it in order", async () => {
    const { stageAccountBatch, getBatchProgress } = await mod();

    const added = await stageAccountBatch(ORDER, ITEM, [
      { email: "a@x.test", password: "p1" },
      { email: "b@x.test", password: "p2" },
      { email: "c@x.test" },
    ]);

    expect(added).toBe(3);
    const progress = await getBatchProgress(ORDER, ITEM);
    expect(progress.total).toBe(3);
    expect(progress.staged).toBe(3);
    expect(progress.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(progress.entries.map((e) => e.email)).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
  });

  it("appends to an existing batch instead of renumbering it", async () => {
    const { stageAccountBatch, getBatchProgress } = await mod();
    await stageAccountBatch(ORDER, ITEM, [{ email: "a@x.test" }]);
    await stageAccountBatch(ORDER, ITEM, [{ email: "b@x.test" }]);

    const progress = await getBatchProgress(ORDER, ITEM);
    expect(progress.entries.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("releases one account at a time and never runs ahead of the buyer", async () => {
    const { stageAccountBatch, claimNextAccount, markAccountRegistered } = await mod();
    await stageAccountBatch(ORDER, ITEM, [
      { email: "a@x.test", password: "p1" },
      { email: "b@x.test", password: "p2" },
    ]);

    const first = await claimNextAccount(ORDER, ITEM);
    expect(first).toMatchObject({ seq: 1, email: "a@x.test", password: "p1" });

    // Nothing more goes out while the buyer still holds one.
    expect(await claimNextAccount(ORDER, ITEM)).toBeUndefined();

    expect(await markAccountRegistered(ORDER, ITEM)).toBe(true);
    const second = await claimNextAccount(ORDER, ITEM);
    expect(second).toMatchObject({ seq: 2, email: "b@x.test", password: "p2" });
  });

  it("hands the same account to only one of two simultaneous releases", async () => {
    const { stageAccountBatch, claimNextAccount } = await mod();
    await stageAccountBatch(ORDER, ITEM, [{ email: "a@x.test" }, { email: "b@x.test" }]);

    const [one, two] = await Promise.all([
      claimNextAccount(ORDER, ITEM),
      claimNextAccount(ORDER, ITEM),
    ]);

    const delivered = [one, two].filter(Boolean);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.seq).toBe(1);
  });

  it("reports nothing left once the batch is exhausted", async () => {
    const { stageAccountBatch, claimNextAccount, markAccountRegistered, getBatchProgress } =
      await mod();
    await stageAccountBatch(ORDER, ITEM, [{ email: "only@x.test" }]);

    await claimNextAccount(ORDER, ITEM);
    await markAccountRegistered(ORDER, ITEM);

    expect(await claimNextAccount(ORDER, ITEM)).toBeUndefined();
    expect(await markAccountRegistered(ORDER, ITEM)).toBe(false);

    const progress = await getBatchProgress(ORDER, ITEM);
    expect(progress).toMatchObject({ total: 1, staged: 0, sent: 0, registered: 1 });
    expect(progress.current).toBeUndefined();
    expect(progress.next).toBeUndefined();
  });

  it("keeps passwords encrypted at rest", async () => {
    const { stageAccountBatch } = await mod();
    await stageAccountBatch(ORDER, ITEM, [{ email: "a@x.test", password: "sup3rSecret" }]);

    const stored = stub.rows[0]!;
    expect(stored.password_enc).toBeTruthy();
    expect(stored.password_enc).not.toContain("sup3rSecret");
    expect(String(stored.password_enc)).toMatch(/^enc:v1:/);
  });

  it("ignores blank rows staff leave in the form", async () => {
    const { stageAccountBatch, getBatchProgress } = await mod();
    const added = await stageAccountBatch(ORDER, ITEM, [
      { email: "a@x.test" },
      { email: "   " },
      { email: "" },
    ]);
    expect(added).toBe(1);
    expect((await getBatchProgress(ORDER, ITEM)).total).toBe(1);
  });

  it("keeps separate order lines independent", async () => {
    const { stageAccountBatch, claimNextAccount, getBatchProgress } = await mod();
    await stageAccountBatch(ORDER, ITEM, [{ email: "a@x.test" }]);
    await stageAccountBatch(ORDER, "itm_2", [{ email: "z@x.test" }]);

    await claimNextAccount(ORDER, ITEM);

    // The other line is untouched and still ready to send.
    expect((await getBatchProgress(ORDER, "itm_2")).staged).toBe(1);
    expect(await claimNextAccount(ORDER, "itm_2")).toMatchObject({ email: "z@x.test" });
  });
});
