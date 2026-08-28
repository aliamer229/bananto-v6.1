#!/usr/bin/env node
/**
 * Consolidates two documents that are one game into one canonical product.
 *
 * INSPECTS BY DEFAULT. `--apply` is required before anything is written, and
 * even then nothing is hard-deleted: the duplicate is tombstoned only after its
 * fields, its relations and its URL have been moved and read back.
 *
 * The canonical side is NOT the more complete one. Completeness is a few days
 * of research; an order, a review, a delivery record is a customer's history,
 * and re-pointing those at a different id to gain four percent of filled fields
 * is the trade this refuses to make. So the identity that already owns the real
 * relationships stays, and the richness moves to it.
 *
 * What moves, field by field:
 *
 *   - a field the canonical product does not have, that the duplicate does
 *   - a media role the canonical product does not have
 *   - a list the duplicate has more of, where the canonical one has none
 *
 * What never moves: `id`, `createdAt`, and anything the canonical product
 * already answers. A blank does not overwrite a value, and a value does not
 * overwrite a different value — that is a decision, and it is reported instead.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const APPLY = process.argv.includes("--apply");
const OUT = flag("out", "product-merge.md");
/** `canonicalSlugOrId:duplicateSlugOrId`, comma separated. */
const PAIRS = flag("pairs", "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const [keep, drop] = p.split(":").map((s) => s.trim());
    if (!keep || !drop) throw new Error(`--pairs wants canonical:duplicate, got "${p}"`);
    return { keep, drop };
  });
if (!PAIRS.length) throw new Error("--pairs is required, as canonical:duplicate");

const SECRETS = [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID].filter(
  (v) => v && v.length >= 8,
);
const redact = (t) => SECRETS.reduce((s, x) => s.split(x).join("«redacted»"), String(t ?? ""));
const lines = [];
const say = (t = "") => {
  const safe = redact(t);
  lines.push(safe);
  console.log(safe);
};

process.env.D1_DATABASE_ID ||= process.env.CLOUDFLARE_D1_DATABASE_ID || "";
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "D1_DATABASE_ID"]) {
  if (!process.env[key]) throw new Error(`missing ${key}`);
}

const outfile = path.resolve(".product-merge-bundle.mjs");
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

const reachable = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reachable.length) throw new Error("D1 is not reachable — refusing to report on nothing");

/* -------------------------------------------------------- the live catalogue */

async function loadCatalogue() {
  const rows = await app.d1All(
    "SELECT key, value FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' OR key LIKE 'store:product:%'",
  );
  let aggregate = "";
  const overlays = [];
  for (const row of rows) {
    const key = String(row.key);
    if (key.startsWith("store:product:")) overlays.push(row);
    else aggregate += String(row.value ?? "");
  }
  const live = new Map();
  const inOverlay = new Set();
  for (const p of JSON.parse(aggregate || "[]")) if (p?.id) live.set(String(p.id), p);
  for (const row of overlays) {
    let doc = null;
    try {
      doc = JSON.parse(String(row.value));
    } catch {
      continue;
    }
    if (!doc?.id) continue;
    if (doc._deleted === true) live.delete(String(doc.id));
    else {
      live.set(String(doc.id), doc);
      inOverlay.add(String(doc.id));
    }
  }
  return { live, inOverlay };
}

const { live, inOverlay } = await loadCatalogue();
const bySlug = new Map();
for (const p of live.values()) if (p.slug) bySlug.set(String(p.slug), p);
const find = (key) => live.get(key) ?? bySlug.get(key) ?? null;

/* ------------------------------------------------- every table that points here */

/**
 * Columns that hold a product id, discovered rather than listed.
 *
 * A hard-coded list of tables goes stale the moment a migration adds one, and
 * the cost of missing a table here is an orphaned order. SQLite is asked what
 * it actually has — in one query. Walking `PRAGMA table_info` table by table is
 * a hundred and thirty round trips against a remote database before any real
 * work starts, and `pragma_table_info` as a table-valued function answers the
 * same question once.
 */
async function referencingColumns() {
  try {
    const rows = await app.d1All(
      "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p" +
        " WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND p.name IN ('product_id', 'game_id')",
    );
    if (rows.length) return rows.map((r) => ({ table: String(r.tbl), column: String(r.col) }));
  } catch {
    /* older SQLite without the table-valued pragma — fall through */
  }
  const tables = await app.d1All(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const found = [];
  for (const t of tables) {
    const name = String(t.name);
    let cols = [];
    try {
      cols = await app.d1All(`PRAGMA table_info(${name})`);
    } catch {
      continue;
    }
    for (const c of cols) {
      const col = String(c.name);
      if (/^(product_id|game_id)$/.test(col)) found.push({ table: name, column: col });
    }
  }
  return found;
}
const REFS = await referencingColumns();

/** Tables whose JSON body can name a product without a column saying so. */
const DOC_ALIAS = "body";
const DOC_TABLES = [
  { table: "orders", column: "doc" },
  { table: "cart_items", column: "doc" },
  { table: "threads", column: "doc" },
  { table: "order_queue", column: "doc" },
];

/**
 * How many rows in each table name each of these products.
 *
 * Every id in one pass per table, grouped, rather than a query per id: the
 * database is remote and one round trip per table per product is most of the
 * run. The `doc` tables still cost one scan each per id, because `LIKE` cannot
 * be grouped, but there are four of those rather than forty.
 */
async function countRefsFor(ids) {
  const byId = new Map(ids.map((id) => [id, []]));
  const holes = ids.map(() => "?").join(",");
  for (const { table, column } of REFS) {
    try {
      const rows = await app.d1All(
        `SELECT ${column} AS pid, count(*) AS n FROM ${table} WHERE ${column} IN (${holes}) GROUP BY ${column}`,
        ...ids,
      );
      for (const r of rows) {
        const n = Number(r?.n ?? 0);
        const pid = String(r?.pid ?? "");
        if (n && byId.has(pid)) byId.get(pid).push({ table, column, n });
      }
    } catch {
      /* a table the deployment does not have */
    }
  }
  /*
    One scan per table, not one per id.

    `LIKE '%prd_…%'` cannot use an index, so each of these reads the whole
    table; asking six times over is six full scans of the orders table before
    anything is reported, and that was most of the run. One predicate that
    matches any of the ids brings back the rows once, and which id each row
    names is decided here.
  */
  for (const { table, column } of DOC_TABLES) {
    const anyOf = ids.map(() => `${column} LIKE ?`).join(" OR ");
    try {
      const rows = await app.d1All(
        `SELECT ${column} AS ${DOC_ALIAS} FROM ${table} WHERE ${anyOf}`,
        ...ids.map((id) => `%${id}%`),
      );
      for (const id of ids) {
        const n = rows.filter((r) => String(r?.[DOC_ALIAS] ?? "").includes(id)).length;
        if (n) byId.get(id).push({ table, column: `${column} (json)`, n });
      }
    } catch {
      /* a table the deployment does not have */
    }
  }
  return byId;
}

const countRefs = async (id) => (await countRefsFor([id])).get(id) ?? [];

const weight = (refs) => refs.reduce((a, r) => a + r.n, 0);

/** References that are a customer's history rather than our own bookkeeping. */
const CUSTOMER_TABLES =
  /^(orders|order_items_snapshot|order_status_history|order_status_history_v2|product_reviews|legacy_reviews|legacy_orders|legacy_order_items|delivery_events|cart_items|coupon_redemptions|product_interactions|browsing_history|game_price_history|order_queue|threads)$/;
const customerWeight = (refs) =>
  refs.filter((r) => CUSTOMER_TABLES.test(r.table)).reduce((a, r) => a + r.n, 0);

/* ------------------------------------------------------------------- report */

say(`# Duplicate consolidation — ${APPLY ? "**APPLY**" : "INSPECT ONLY (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- product-id columns discovered across the database: **${REFS.length}**`);
say(`- ${REFS.map((r) => `\`${r.table}.${r.column}\``).join(", ")}`);
say();

const nowIso = () => new Date().toISOString();
const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return Boolean(v.trim());
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return false;
};
const NEVER_MOVE = new Set(["id", "createdAt", "created_at", "slug", "_deleted"]);

const results = [];

/* Every product in every pair, counted in one sweep of the database. */
const everyId = [
  ...new Set(
    PAIRS.flatMap((p) => [find(p.keep), find(p.drop)])
      .filter(Boolean)
      .map((d) => String(d.id)),
  ),
];
const refsById = everyId.length ? await countRefsFor(everyId) : new Map();
say(`- products resolved and counted in one sweep: **${everyId.length}**`);
say();

for (const pair of PAIRS) {
  const keep = find(pair.keep);
  const drop = find(pair.drop);
  say(`## \`${pair.keep}\` ← \`${pair.drop}\``);
  say();
  if (!keep || !drop) {
    say(`**SKIPPED** — ${!keep ? `\`${pair.keep}\`` : `\`${pair.drop}\``} is not a live product.`);
    say();
    results.push({ pair, status: "NOT_FOUND" });
    continue;
  }
  if (String(keep.id) === String(drop.id)) {
    say(`**SKIPPED** — both names resolve to the same product \`${keep.id}\`.`);
    say();
    results.push({ pair, status: "SAME_PRODUCT" });
    continue;
  }

  const keepRefs = refsById.get(String(keep.id)) ?? [];
  const dropRefs = refsById.get(String(drop.id)) ?? [];

  say(`| | canonical candidate | duplicate candidate |`);
  say(`| --- | --- | --- |`);
  say(`| slug | \`${keep.slug}\` | \`${drop.slug}\` |`);
  say(`| id | \`${keep.id}\` | \`${drop.id}\` |`);
  say(`| title | ${keep.title ?? keep.name ?? ""} | ${drop.title ?? drop.name ?? ""} |`);
  say(`| createdAt | ${keep.createdAt ?? "—"} | ${drop.createdAt ?? "—"} |`);
  say(`| updatedAt | ${keep.updatedAt ?? "—"} | ${drop.updatedAt ?? "—"} |`);
  say(`| hidden | ${keep.isHidden === true ? "yes" : "no"} | ${drop.isHidden === true ? "yes" : "no"} |`);
  say(`| has an overlay row | ${inOverlay.has(String(keep.id)) ? "yes" : "no"} | ${inOverlay.has(String(drop.id)) ? "yes" : "no"} |`);
  say(`| fields filled | ${Object.keys(keep).filter((k) => filled(keep[k])).length} | ${Object.keys(drop).filter((k) => filled(drop[k])).length} |`);
  say(`| rows referencing it | **${weight(keepRefs)}** | **${weight(dropRefs)}** |`);
  say(`| of those, customer history | **${customerWeight(keepRefs)}** | **${customerWeight(dropRefs)}** |`);
  say();

  say(`Every reference, by table:`);
  say();
  say(`| table.column | canonical | duplicate |`);
  say(`| --- | ---: | ---: |`);
  const tables = [...new Set([...keepRefs, ...dropRefs].map((r) => `${r.table}.${r.column}`))].sort();
  if (!tables.length) say(`| _none_ | 0 | 0 |`);
  for (const t of tables) {
    const a = keepRefs.find((r) => `${r.table}.${r.column}` === t)?.n ?? 0;
    const b = dropRefs.find((r) => `${r.table}.${r.column}` === t)?.n ?? 0;
    say(`| \`${t}\` | ${a} | ${b} |`);
  }
  say();

  /* Who keeps the identity. History decides it; completeness never does. */
  const keepCustomer = customerWeight(keepRefs);
  const dropCustomer = customerWeight(dropRefs);
  let canonical = keep;
  let duplicate = drop;
  let why = "named as canonical, and the duplicate owns no customer history";
  if (dropCustomer > keepCustomer) {
    canonical = drop;
    duplicate = keep;
    why = `the named duplicate owns more customer history (${dropCustomer} rows against ${keepCustomer})`;
  } else if (keepCustomer === 0 && dropCustomer === 0) {
    why = "neither owns customer history, so the named canonical stands";
  } else {
    why = `it owns the customer history (${keepCustomer} rows against ${dropCustomer})`;
  }
  say(`**Canonical: \`${canonical.slug}\` (\`${canonical.id}\`)** — ${why}.`);
  if (canonical.id !== keep.id) {
    say();
    say(
      `**STOPPING.** The named canonical is not the one holding the history. Re-pointing a customer's order is not a call this should make on its own.`,
    );
    say();
    results.push({ pair, status: "OWNERSHIP_CONFLICT" });
    continue;
  }
  say();

  /* ------------------------------------------------- what the duplicate adds */

  const adds = [];
  const conflicts = [];
  for (const [key, value] of Object.entries(duplicate)) {
    if (NEVER_MOVE.has(key)) continue;
    if (!filled(value)) continue;
    if (!filled(canonical[key])) {
      adds.push({ key, value });
      continue;
    }
    if (JSON.stringify(canonical[key]) !== JSON.stringify(value)) conflicts.push({ key });
  }

  say(`### What the duplicate carries that the canonical product does not`);
  say();
  if (!adds.length) say("Nothing — the canonical product already answers every field the duplicate fills.");
  else {
    say(`| field | value moving across |`);
    say(`| --- | --- |`);
    for (const a of adds) {
      const shown = JSON.stringify(a.value);
      say(`| \`${a.key}\` | ${shown.length > 90 ? `${shown.slice(0, 90)}… (${shown.length} chars)` : shown} |`);
    }
  }
  say();

  say(`### Fields both answer, differently — left alone`);
  say();
  if (!conflicts.length) say("None.");
  else {
    say(
      `${conflicts.length} field(s): ${conflicts.map((c) => `\`${c.key}\``).join(", ")}. A value is not overwritten by a different value; that is a decision, not a merge.`,
    );
  }
  say();

  if (!APPLY) {
    say(`_Inspect only — nothing written._`);
    say();
    results.push({ pair, status: "WOULD_MERGE", adds: adds.length, canonical: canonical.id, duplicate: duplicate.id });
    continue;
  }

  /* ------------------------------------------------------------- the merge */

  const merged = { ...canonical, updatedAt: nowIso() };
  for (const a of adds) merged[a.key] = a.value;

  await app.d1Run(
    "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `store:product:${canonical.id}`,
    JSON.stringify(merged),
    nowIso(),
  );
  const back = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${canonical.id}`);
  let stored = null;
  try {
    stored = back?.[0]?.value ? JSON.parse(String(back[0].value)) : null;
  } catch {
    stored = null;
  }
  const landed = adds.filter((a) => JSON.stringify(stored?.[a.key]) === JSON.stringify(a.value)).length;
  say(`- fields merged and read back: **${landed} of ${adds.length}**`);
  if (landed !== adds.length) {
    say(`- **READ-BACK FAILED — stopping before anything is retired.**`);
    say();
    results.push({ pair, status: "READBACK_FAILED" });
    process.exitCode = 1;
    continue;
  }

  /* ---------------------------------------------------- relations re-pointed */

  const moved = [];
  for (const { table, column } of REFS) {
    let n = 0;
    try {
      const r = await app.d1All(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`, String(duplicate.id));
      n = Number(r?.[0]?.n ?? 0);
    } catch {
      continue;
    }
    if (!n) continue;
    /*
      product_identity is keyed on (normalized_title, platform), which is the
      very thing these two share — re-pointing would collide with the canonical
      row. The duplicate's row is removed instead; the canonical one already
      says what it needs to.
    */
    if (table === "product_identity" || table === "product_index") {
      await app.d1Run(`DELETE FROM ${table} WHERE ${column} = ?`, String(duplicate.id));
      moved.push(`${table}: ${n} row(s) removed (the canonical row already holds this identity)`);
      continue;
    }
    await app.d1Run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, String(canonical.id), String(duplicate.id));
    const after = await app.d1All(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`, String(duplicate.id));
    moved.push(`${table}: ${n} row(s) → canonical, ${Number(after?.[0]?.n ?? 0)} left behind`);
  }
  say(`- relations re-pointed: ${moved.length ? moved.join("; ") : "none to move"}`);

  /* --------------------------------------------------- the old url still works */

  const aliasId = `alias_${String(duplicate.id).replace(/^prd_/, "")}`;
  await app.d1Run(
    "INSERT INTO game_aliases (id, game_id, alias, normalized, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)" +
      " ON CONFLICT(normalized) DO UPDATE SET game_id = excluded.game_id",
    aliasId,
    String(canonical.id),
    String(duplicate.slug ?? duplicate.id),
    String(duplicate.slug ?? duplicate.id).toLowerCase(),
    "merged_slug",
    nowIso(),
  );
  const alias = await app.d1All(
    "SELECT game_id FROM game_aliases WHERE normalized = ?",
    String(duplicate.slug ?? duplicate.id).toLowerCase(),
  );
  const aliasOk = String(alias?.[0]?.game_id ?? "") === String(canonical.id);
  say(`- old slug \`${duplicate.slug}\` → canonical: ${aliasOk ? "**alias stored and read back**" : "**ALIAS FAILED**"}`);
  if (!aliasOk) {
    say(`- **stopping before retiring the duplicate — an old link would 404.**`);
    say();
    results.push({ pair, status: "ALIAS_FAILED" });
    process.exitCode = 1;
    continue;
  }

  /* ------------------------------------------------------------ retirement */

  const leftover = await countRefs(String(duplicate.id));
  const stillCustomer = customerWeight(leftover);
  if (stillCustomer) {
    say(
      `- **${stillCustomer} customer row(s) still name the duplicate — not retiring it.** ${leftover.map((r) => `${r.table}.${r.column}=${r.n}`).join(", ")}`,
    );
    say();
    results.push({ pair, status: "REFERENCES_REMAIN" });
    continue;
  }

  await app.d1Run(
    "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `store:product:${duplicate.id}`,
    JSON.stringify({
      id: duplicate.id,
      _deleted: true,
      mergedInto: canonical.id,
      mergedAt: nowIso(),
      formerSlug: duplicate.slug ?? "",
      formerTitle: duplicate.title ?? duplicate.name ?? "",
    }),
    nowIso(),
  );

  /*
    The tombstone is the only thing hiding it now, so prove it holds: compose
    the catalogue again and check the id is gone from the live set.
  */
  const after = await loadCatalogue();
  const gone = !after.live.has(String(duplicate.id));
  const canonicalSurvives = after.live.has(String(canonical.id));
  say(`- duplicate tombstoned: ${gone ? "**gone from the live catalogue**" : "**STILL LIVE**"}`);
  say(`- canonical still live: ${canonicalSurvives ? "**yes**" : "**NO**"}`);
  say();
  const ok = gone && canonicalSurvives;
  if (!ok) process.exitCode = 1;
  results.push({ pair, status: ok ? "MERGED" : "VERIFY_FAILED", canonical: canonical.id, duplicate: duplicate.id });
}

say(`## Summary`);
say();
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
say(`| outcome | pairs |`);
say(`| --- | ---: |`);
for (const [status, n] of Object.entries(tally)) say(`| ${status} | ${n} |`);
say();

writeFileSync(OUT, lines.join("\n") + "\n");
