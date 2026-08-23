/**
 * @vitest-environment node
 *
 * Needs the real `node:sqlite`, which the default jsdom environment cannot load.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These run against a real SQLite database rather than mocks, because the
 * behaviour under test *is* the SQL: an upsert whose conflict target is the
 * `(coupon_id, user_id)` primary key, and a guarded counter update. A mocked
 * `d1Run` would happily "pass" a version of this that double-counts in
 * production.
 *
 * `node:sqlite` speaks the same dialect D1 does for everything used here
 * (`ON CONFLICT ... DO UPDATE ... WHERE`, `COALESCE`, `MAX`), and `changes()`
 * is what D1 reports as `meta.changes`.
 */
const db = new DatabaseSync(":memory:");

vi.mock("./d1.server", () => ({
  d1First: async (sql: string, ...binds: unknown[]) => db.prepare(sql).get(...(binds as never[])),
  d1All: async (sql: string, ...binds: unknown[]) => db.prepare(sql).all(...(binds as never[])),
  d1Run: async (sql: string, ...binds: unknown[]) => {
    db.prepare(sql).run(...(binds as never[]));
  },
  d1RunChanges: async (sql: string, ...binds: unknown[]) =>
    Number(db.prepare(sql).run(...(binds as never[])).changes ?? 0),
}));

const { claimCouponUse, readCouponUsage, releaseCouponUse } = await import("./coupon-usage.server");

function reset() {
  db.exec(`DROP TABLE IF EXISTS coupons`);
  db.exec(`DROP TABLE IF EXISTS coupon_user_usage`);
  db.exec(`DROP TABLE IF EXISTS coupon_redemptions`);
  db.exec(`CREATE TABLE coupons (
    id TEXT PRIMARY KEY, code TEXT, usage_limit INTEGER, per_user_limit INTEGER DEFAULT 1,
    total_uses INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE coupon_user_usage (
    coupon_id TEXT NOT NULL, user_id TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0,
    first_used_at TEXT NOT NULL, last_used_at TEXT NOT NULL,
    PRIMARY KEY (coupon_id, user_id))`);
  db.exec(`CREATE TABLE coupon_redemptions (
    id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL, coupon_type TEXT, user_id TEXT NOT NULL,
    order_id TEXT NOT NULL, discount_amount REAL, target_product_id TEXT, created_at TEXT NOT NULL)`);
}

const usesOf = (couponId: string, userId: string) =>
  Number(
    (
      db
        .prepare(`SELECT uses FROM coupon_user_usage WHERE coupon_id = ? AND user_id = ?`)
        .get(couponId, userId) as { uses?: number } | undefined
    )?.uses ?? 0,
  );

const totalOf = (couponId: string) =>
  Number(
    (
      db.prepare(`SELECT total_uses FROM coupons WHERE id = ?`).get(couponId) as {
        total_uses?: number;
      }
    )?.total_uses ?? 0,
  );

describe("per-user coupon limits", () => {
  beforeEach(() => {
    reset();
  });

  it("lets every member use a once-per-customer coupon exactly once", async () => {
    // No global cap: usage_limit is NULL, which must mean unlimited.
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, NULL, 1)`,
    ).run("cpn_share", "SHARE10");

    const claim = (userId: string) =>
      claimCouponUse({
        couponId: "cpn_share",
        userId,
        perUserLimit: 1,
        totalLimit: undefined,
      });

    // A uses it.
    expect(await claim("user_a")).toEqual({ ok: true });
    // A cannot use it again.
    expect(await claim("user_a")).toEqual({ ok: false, reason: "per_user_limit" });
    // B is completely unaffected by A — this is the whole bug.
    expect(await claim("user_b")).toEqual({ ok: true });
    // And B is likewise capped at one.
    expect(await claim("user_b")).toEqual({ ok: false, reason: "per_user_limit" });
    // A third member still gets theirs.
    expect(await claim("user_c")).toEqual({ ok: true });

    expect(usesOf("cpn_share", "user_a")).toBe(1);
    expect(usesOf("cpn_share", "user_b")).toBe(1);
    expect(totalOf("cpn_share")).toBe(3);
  });

  it("never exhausts a coupon globally when no total cap is set", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, NULL, 1)`,
    ).run("cpn_open", "OPEN");

    for (let i = 0; i < 25; i++) {
      const result = await claimCouponUse({
        couponId: "cpn_open",
        userId: `user_${i}`,
        perUserLimit: 1,
        totalLimit: undefined,
      });
      expect(result, `member ${i} should still be able to use it`).toEqual({ ok: true });
    }
    expect(totalOf("cpn_open")).toBe(25);
  });

  it("treats a total cap of 0 or an empty value as unlimited", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, 0, 1)`,
    ).run("cpn_zero", "ZERO");

    for (const total of [0, undefined, null as unknown as undefined]) {
      db.prepare(`UPDATE coupons SET total_uses = 0 WHERE id = ?`).run("cpn_zero");
      db.prepare(`DELETE FROM coupon_user_usage WHERE coupon_id = ?`).run("cpn_zero");
      expect(
        await claimCouponUse({
          couponId: "cpn_zero",
          userId: "user_a",
          perUserLimit: 1,
          totalLimit: total,
        }),
      ).toEqual({ ok: true });
    }
  });

  it("honours a real total cap across different members", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, 2, 1)`,
    ).run("cpn_two", "TWO");

    const claim = (userId: string) =>
      claimCouponUse({ couponId: "cpn_two", userId, perUserLimit: 1, totalLimit: 2 });

    expect(await claim("user_a")).toEqual({ ok: true });
    expect(await claim("user_b")).toEqual({ ok: true });
    // Cap reached: a third member is refused on the *global* rule.
    expect(await claim("user_c")).toEqual({ ok: false, reason: "usage_limit" });
    expect(totalOf("cpn_two")).toBe(2);
    // And the refused member was not charged a use.
    expect(usesOf("cpn_two", "user_c")).toBe(0);
  });

  it("allows a member their full allowance when per_user_limit is above 1", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, NULL, 3)`,
    ).run("cpn_three", "THREE");

    const claim = () =>
      claimCouponUse({
        couponId: "cpn_three",
        userId: "user_a",
        perUserLimit: 3,
        totalLimit: undefined,
      });

    expect(await claim()).toEqual({ ok: true });
    expect(await claim()).toEqual({ ok: true });
    expect(await claim()).toEqual({ ok: true });
    expect(await claim()).toEqual({ ok: false, reason: "per_user_limit" });
    expect(usesOf("cpn_three", "user_a")).toBe(3);
  });

  it("defaults to one use per member when no limit is supplied", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, NULL, NULL)`,
    ).run("cpn_default", "DEF");

    expect(await claimCouponUse({ couponId: "cpn_default", userId: "u" })).toEqual({ ok: true });
    expect(await claimCouponUse({ couponId: "cpn_default", userId: "u" })).toEqual({
      ok: false,
      reason: "per_user_limit",
    });
  });

  it("hands a use back when a later step of checkout fails", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, 5, 1)`,
    ).run("cpn_rel", "REL");

    await claimCouponUse({
      couponId: "cpn_rel",
      userId: "user_a",
      perUserLimit: 1,
      totalLimit: 5,
    });
    expect(usesOf("cpn_rel", "user_a")).toBe(1);

    await releaseCouponUse({ couponId: "cpn_rel", userId: "user_a", releaseGlobal: true });
    expect(usesOf("cpn_rel", "user_a")).toBe(0);
    expect(totalOf("cpn_rel")).toBe(0);

    // The member can now use it for real.
    expect(
      await claimCouponUse({
        couponId: "cpn_rel",
        userId: "user_a",
        perUserLimit: 1,
        totalLimit: 5,
      }),
    ).toEqual({ ok: true });
  });

  it("never lets a release drive a counter negative", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit) VALUES (?, ?, NULL, 1)`,
    ).run("cpn_neg", "NEG");
    db.prepare(
      `INSERT INTO coupon_user_usage (coupon_id, user_id, uses, first_used_at, last_used_at)
       VALUES ('cpn_neg', 'u', 0, 'x', 'x')`,
    ).run();

    await releaseCouponUse({ couponId: "cpn_neg", userId: "u", releaseGlobal: true });
    expect(usesOf("cpn_neg", "u")).toBe(0);
    expect(totalOf("cpn_neg")).toBe(0);
  });
});

describe("readCouponUsage", () => {
  beforeEach(() => {
    reset();
  });

  it("reports each member's own count, not the shared total", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit, total_uses)
                VALUES ('c1', 'C1', NULL, 1, 4)`,
    ).run();
    db.prepare(
      `INSERT INTO coupon_user_usage (coupon_id, user_id, uses, first_used_at, last_used_at)
                VALUES ('c1', 'a', 1, 'x', 'x'), ('c1', 'b', 3, 'x', 'x')`,
    ).run();

    expect(await readCouponUsage("c1", "a")).toEqual({ userUses: 1, globalUses: 4 });
    expect(await readCouponUsage("c1", "b")).toEqual({ userUses: 3, globalUses: 4 });
    // A member who has never used it starts at zero regardless of the total.
    expect(await readCouponUsage("c1", "c")).toEqual({ userUses: 0, globalUses: 4 });
  });

  it("falls back to the redemption trail for rows the backfill has not reached", async () => {
    db.prepare(
      `INSERT INTO coupons (id, code, usage_limit, per_user_limit, total_uses)
                VALUES ('c2', 'C2', NULL, 1, NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, created_at)
                VALUES ('r1', 'c2', 'a', 'o1', 'x'), ('r2', 'c2', 'b', 'o2', 'x')`,
    ).run();

    // No coupon_user_usage rows at all: counts come from the audit trail so a
    // database mid-migration does not hand everyone a free use.
    expect(await readCouponUsage("c2", "a")).toEqual({ userUses: 1, globalUses: 2 });
    expect(await readCouponUsage("c2", "c")).toEqual({ userUses: 0, globalUses: 2 });
  });
});
