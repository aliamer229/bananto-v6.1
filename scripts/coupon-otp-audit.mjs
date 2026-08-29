#!/usr/bin/env node
/**
 * Coupon and OTP integrity, checked against the production database.
 *
 * READ ONLY. There is no apply flag and no statement here mutates anything.
 *
 * A passing test suite says the code is right about a database it invented.
 * This asks the real one: does the schema the coupon engine depends on exist,
 * do the caps it claims to enforce actually hold across every row that has ever
 * been written, and is there anywhere in production a plaintext one-time code
 * could be sitting.
 *
 * Every check either passes, fails with the rows that broke it, or reports that
 * it could not run. A query that errors is never counted as "nothing found" —
 * that failure mode is the reason this file exists in the shape it does.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

const SECRETS = [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID].filter(
  (v) => v && v.length >= 8,
);
const redact = (t) => SECRETS.reduce((s, x) => s.split(x).join("«redacted»"), String(t ?? ""));
const lines = [];
const say = (t = "") => {
  const s = redact(t);
  lines.push(s);
  console.log(s);
};

const outfile = path.resolve(".coupon-audit-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/import-entry.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  logLevel: "silent",
  alias: { "@": path.resolve("src") },
  external: ["cloudflare:workers", "node:async_hooks", "node:crypto", "sharp"],
});
const app = await import(outfile);

const reach = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reach.length) throw new Error("D1 unreachable — refusing to report on nothing");

/** Results, so the summary counts what actually ran rather than what was written. */
const results = [];

/**
 * Runs one check.
 *
 * Three outcomes, not two. A thrown query is UNREADABLE, distinct from a check
 * that ran and found nothing. And a check whose query had no rows to look at is
 * VACUOUS: "0 over-limit" across an empty table is not evidence of anything, and
 * counting it as a pass is how an audit ends up reassuring people about data it
 * never read. Any check that can be vacuous reports how many rows it examined.
 */
async function check(name, fn) {
  try {
    const outcome = await fn();
    const vacuous = outcome.examined === 0;
    results.push({ name, ...outcome, vacuous });
    const mark = vacuous ? "VACUOUS" : outcome.ok ? "PASS" : "FAIL";
    const scope = outcome.examined === undefined ? "" : ` [${outcome.examined} rows examined]`;
    say(`- **${mark}** — ${name}${outcome.detail ? `: ${outcome.detail}` : ""}${scope}`);
    for (const row of outcome.rows ?? []) say(`    - ${row}`);
  } catch (error) {
    results.push({ name, ok: false, unreadable: true });
    say(`- **UNREADABLE** — ${name}: ${redact(String(error)).slice(0, 200)}`);
  }
}

/** How many rows a check's population actually contains. */
async function countRows(sql, ...binds) {
  const rows = await app.d1All(sql, ...binds);
  return Number(rows[0]?.n ?? 0);
}

/** Column names of a table, read from the CREATE statement D1 will show us. */
async function columnsOf(table) {
  const rows = await app.d1All(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  );
  const sql = String(rows[0]?.sql ?? "");
  if (!sql) return null;
  const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  return body
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => name && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(name));
}

say(`# Coupon and OTP integrity — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();

/* ------------------------------- coupons --------------------------------- */

say(`## Coupons`);
say();

await check("the coupon engine's columns exist in production", async () => {
  const wanted = {
    coupons: ["offline_account_only", "total_uses", "per_user_limit", "once_per_user_lifetime"],
    coupon_redemptions: ["variant_id", "coupon_id", "user_id", "order_id"],
    coupon_user_usage: ["coupon_id", "user_id", "uses"],
  };
  const missing = [];
  for (const [table, columns] of Object.entries(wanted)) {
    const actual = await columnsOf(table);
    if (!actual) {
      missing.push(`${table} (table absent)`);
      continue;
    }
    for (const column of columns) if (!actual.includes(column)) missing.push(`${table}.${column}`);
  }
  return {
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "all present",
  };
});

await check("no member has used a coupon more times than its per-user limit", async () => {
  const rows = await app.d1All(
    `SELECT u.coupon_id, u.user_id, u.uses, c.per_user_limit, c.code
       FROM coupon_user_usage u JOIN coupons c ON c.id = u.coupon_id
      WHERE c.per_user_limit IS NOT NULL AND u.uses > c.per_user_limit`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} over-limit`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupon_user_usage u JOIN coupons c ON c.id = u.coupon_id
        WHERE c.per_user_limit IS NOT NULL`,
    ),
    rows: rows.map((r) => `${r.code}: user ${r.user_id} used ${r.uses} of ${r.per_user_limit}`),
  };
});

await check("no lifetime-once coupon has been used twice by one member", async () => {
  const rows = await app.d1All(
    `SELECT c.code, u.user_id, u.uses
       FROM coupon_user_usage u JOIN coupons c ON c.id = u.coupon_id
      WHERE c.once_per_user_lifetime = 1 AND u.uses > 1`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} over-limit`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupon_user_usage u JOIN coupons c ON c.id = u.coupon_id
        WHERE c.once_per_user_lifetime = 1`,
    ),
    rows: rows.map((r) => `${r.code}: user ${r.user_id} used ${r.uses}`),
  };
});

await check("no coupon has been redeemed past its global cap", async () => {
  const rows = await app.d1All(
    `SELECT code, total_uses, usage_limit FROM coupons
      WHERE usage_limit IS NOT NULL AND COALESCE(total_uses, 0) > usage_limit`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} over cap`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupons WHERE usage_limit IS NOT NULL`,
    ),
    rows: rows.map((r) => `${r.code}: ${r.total_uses} of ${r.usage_limit}`),
  };
});

await check("the same coupon was never redeemed twice on one order", async () => {
  // The UNIQUE(coupon_id, user_id, order_id) is what makes a retried checkout
  // idempotent; this is that constraint, checked against the rows rather than
  // against the schema text.
  const rows = await app.d1All(
    `SELECT coupon_id, user_id, order_id, COUNT(*) AS n
       FROM coupon_redemptions GROUP BY coupon_id, user_id, order_id HAVING n > 1`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} duplicated`,
    examined: await countRows(`SELECT COUNT(*) AS n FROM coupon_redemptions`),
    rows: rows.map((r) => `coupon ${r.coupon_id} order ${r.order_id} × ${r.n}`),
  };
});

await check("the per-member counters agree with the redemption trail", async () => {
  /*
    `coupon_redemptions` is what happened; the counters are a cache of it kept
    so a cap can be claimed atomically. Drift in either direction is a real
    fault: too high refuses a member who never used it, too low lets one
    through twice.
  */
  const rows = await app.d1All(
    `SELECT c.code, r.user_id, COUNT(*) AS redemptions, COALESCE(u.uses, 0) AS counter
       FROM coupon_redemptions r
       JOIN coupons c ON c.id = r.coupon_id
       LEFT JOIN coupon_user_usage u ON u.coupon_id = r.coupon_id AND u.user_id = r.user_id
      GROUP BY r.coupon_id, r.user_id
     HAVING redemptions <> counter`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} drifted`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id`,
    ),
    rows: rows.map(
      (r) => `${r.code}: user ${r.user_id} has ${r.redemptions} rows, counter ${r.counter}`,
    ),
  };
});

await check("no Offline-only coupon was ever redeemed against an Online line", async () => {
  /*
    This is the rule the whole option-scoped coupon work exists for. The stored
    `variant_id` is the option the discounted copy was bought with, so an
    offline-only coupon whose redemption names an online option is the failure
    in its own audit trail. Matching is on the word, the same way
    `offlineAccount.ts` does it: `offline` does not contain `online`, so a
    line saying both is not treated as offline.
  */
  const rows = await app.d1All(
    `SELECT c.code, r.variant_id, r.order_id, r.user_id
       FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id
      WHERE c.offline_account_only = 1
        AND r.variant_id IS NOT NULL
        AND lower(r.variant_id) LIKE '%online%'
        AND lower(r.variant_id) NOT LIKE '%offline%'`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} mis-scoped`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id
        WHERE c.offline_account_only = 1`,
    ),
    rows: rows.map((r) => `${r.code}: order ${r.order_id} used option ${r.variant_id}`),
  };
});

await check("no redemption is attached to a cancelled order", async () => {
  /*
    A cancelled checkout that keeps its redemption row burns the member's one
    use of the coupon on an order they never received.
  */
  const rows = await app.d1All(
    `SELECT c.code, r.order_id, r.user_id
       FROM coupon_redemptions r
       JOIN coupons c ON c.id = r.coupon_id
       JOIN orders o ON o.id = r.order_id
      WHERE o.status = 'cancelled' OR o.cancelled_at IS NOT NULL`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} on cancelled orders`,
    examined: await countRows(
      `SELECT COUNT(*) AS n FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id`,
    ),
    rows: rows.slice(0, 20).map((r) => `${r.code}: order ${r.order_id}, user ${r.user_id}`),
  };
});

await check("every redemption still points at a coupon that exists", async () => {
  /*
    The first production run of this file passed eight coupon checks against a
    `coupons` table with nothing in it — 9 redemptions and 9 per-member counter
    rows all referencing coupons that had been deleted. Nothing is at risk (a
    deleted coupon cannot be redeemed again), but every check that joins
    `coupons` was looking at no rows, and a vacuous pass is worse than a
    failure because it reads like evidence. This is the check that says so.
  */
  const orphanRedemptions = await app.d1All(
    `SELECT r.coupon_id, COUNT(*) AS n FROM coupon_redemptions r
       LEFT JOIN coupons c ON c.id = r.coupon_id
      WHERE c.id IS NULL GROUP BY r.coupon_id`,
  );
  const orphanCounters = await countRows(
    `SELECT COUNT(*) AS n FROM coupon_user_usage u
       LEFT JOIN coupons c ON c.id = u.coupon_id WHERE c.id IS NULL`,
  );
  const total = orphanRedemptions.reduce((sum, row) => sum + Number(row.n ?? 0), 0);
  return {
    ok: total === 0 && orphanCounters === 0,
    detail: `${total} redemptions and ${orphanCounters} counter rows reference a deleted coupon`,
    examined: await countRows(`SELECT COUNT(*) AS n FROM coupon_redemptions`),
    rows: orphanRedemptions.map((r) => `coupon ${r.coupon_id} — ${r.n} redemptions, no coupon row`),
  };
});

const couponCounts = await app.d1All(
  `SELECT (SELECT COUNT(*) FROM coupons) AS coupons,
          (SELECT COUNT(*) FROM coupons WHERE is_active = 1) AS active,
          (SELECT COUNT(*) FROM coupons WHERE offline_account_only = 1) AS offline_only,
          (SELECT COUNT(*) FROM coupon_redemptions) AS redemptions,
          (SELECT COUNT(*) FROM coupon_user_usage) AS counters`,
);
say();
say(
  `Scope: **${couponCounts[0]?.coupons ?? "?"}** coupons (${couponCounts[0]?.active ?? "?"} active, ` +
    `${couponCounts[0]?.offline_only ?? "?"} offline-only), ` +
    `**${couponCounts[0]?.redemptions ?? "?"}** redemptions, ` +
    `**${couponCounts[0]?.counters ?? "?"}** per-member counter rows.`,
);
say();

/* --------------------------------- OTP ------------------------------------ */

say(`## OTP`);
say();

/*
  Columns literally named `code` that are not one-time codes, each with the
  reason it is not one. Named rather than pattern-matched away, so adding an
  exemption is a decision somebody has to write down.
*/
const NOT_ONE_TIME_CODES = {
  "orders.code": "the human-readable order reference printed on a receipt",
  "coupons.code": "the discount code a customer types in — public by design",
  "banan_codes.code":
    "a prepaid voucher; a bearer token the store issues and the member redeems, not an authentication code",
};

await check("no table in production stores a one-time code in the clear", async () => {
  /*
    The strongest statement available about "never fabricate an OTP" is
    structural: a column that could hold a readable one-time code is where a
    fabricated one would live. `code_hash` is fine — a hash is not a code.

    The first run of this check flagged `orders.code`, `coupons.code` and
    `banan_codes.code`, none of which is a one-time code. That was this check
    being wrong, not production. Rather than loosen the pattern until it stops
    complaining, the three are exempted by name with a stated reason, so a
    genuinely new `code` column still fails.
  */
  const tables = await app.d1All(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  if (!tables.length) throw new Error("the schema came back empty — refusing to call that a pass");
  const suspicious = [];
  for (const table of tables) {
    const body = String(table.sql ?? "");
    for (const match of body.matchAll(
      /(^|[(,\s])((?:otp|verification|one_time|auth|2fa)_?code|code)\s+(TEXT|VARCHAR)/gi,
    )) {
      const column = match[2];
      if (/hash/i.test(column)) continue;
      const key = `${table.name}.${column}`;
      if (NOT_ONE_TIME_CODES[key]) continue;
      suspicious.push(key);
    }
  }
  return {
    ok: suspicious.length === 0,
    detail: suspicious.length
      ? suspicious.join(", ")
      : `${tables.length} tables scanned, ${Object.keys(NOT_ONE_TIME_CODES).length} known non-OTP columns exempt`,
    examined: tables.length,
  };
});

await check("`otp_codes` keeps a hash and an expiry, not a code", async () => {
  const columns = await columnsOf("otp_codes");
  if (!columns) return { ok: false, detail: "table absent" };
  const hasHash = columns.includes("code_hash");
  const hasPlain = columns.includes("code");
  const hasExpiry = columns.includes("expires_at");
  return {
    ok: hasHash && hasExpiry && !hasPlain,
    detail: `columns: ${columns.join(", ")}`,
  };
});

await check("no OTP is stored without an expiry", async () => {
  const rows = await app.d1All(
    `SELECT COUNT(*) AS n FROM otp_codes WHERE expires_at IS NULL OR trim(expires_at) = ''`,
  );
  const n = Number(rows[0]?.n ?? 0);
  return { ok: n === 0, detail: `${n} without expiry` };
});

await check("no OTP is marked verified without ever being issued", async () => {
  const rows = await app.d1All(
    `SELECT COUNT(*) AS n FROM otp_codes
      WHERE verified_at IS NOT NULL AND (code_hash IS NULL OR trim(code_hash) = '')`,
  );
  const n = Number(rows[0]?.n ?? 0);
  return { ok: n === 0, detail: `${n} verified with no hash` };
});

await check("every delivery item past `otp_sent` carries the timestamp that proves it", async () => {
  /*
    The delivery OTP is issued by the seller, not generated by us — the state
    machine refuses to advance without a code. A row sitting in `otp_sent` or
    `completed` with no `otp_sent_at` would mean something moved it without
    going through that gate.
  */
  const rows = await app.d1All(
    `SELECT id, order_id, status FROM order_delivery_items
      WHERE status IN ('otp_sent', 'completed') AND otp_sent_at IS NULL`,
  );
  return {
    ok: rows.length === 0,
    detail: `${rows.length} without a send timestamp`,
    rows: rows.slice(0, 20).map((r) => `${r.id} (order ${r.order_id}, ${r.status})`),
  };
});

const otpCounts = await app.d1All(
  `SELECT COUNT(*) AS total,
          SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified
     FROM otp_codes`,
);
say();
say(
  `Scope: **${otpCounts[0]?.total ?? "?"}** OTP rows, **${otpCounts[0]?.verified ?? "?"}** verified.`,
);

/* ------------------------------- summary ---------------------------------- */

const unreadable = results.filter((r) => r.unreadable);
const vacuous = results.filter((r) => r.vacuous && !r.unreadable);
const failed = results.filter((r) => !r.ok && !r.unreadable && !r.vacuous);
const passed = results.filter((r) => r.ok && !r.vacuous && !r.unreadable);
say();
say(`## Summary`);
say();
say(`- checks run: **${results.length}**`);
say(`- passed on real rows: **${passed.length}**`);
say(`- failed: **${failed.length}**`);
say(`- vacuous (nothing to check): **${vacuous.length}**`);
say(`- unreadable: **${unreadable.length}**`);
if (failed.length) say(`- failing: ${failed.map((r) => r.name).join("; ")}`);
if (vacuous.length) {
  say(`- examined no rows, so they prove nothing: ${vacuous.map((r) => r.name).join("; ")}`);
}
if (unreadable.length) say(`- unreadable: ${unreadable.map((r) => r.name).join("; ")}`);

writeFileSync("coupon-otp-audit.md", lines.join("\n") + "\n");

/*
  A failure or a query that could not run fails the job. Vacuity does not: an
  empty coupon table is a fact about the store, not a defect, and failing on it
  would train everyone to ignore this job. It is reported in the summary instead,
  where it cannot be mistaken for evidence.
*/
if (failed.length || unreadable.length) process.exit(1);
