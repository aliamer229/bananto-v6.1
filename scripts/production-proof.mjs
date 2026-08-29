#!/usr/bin/env node
/**
 * What is actually in production, counted from D1. Read-only, no apply flag.
 *
 * Answers the question the admin screen cannot: the listing applies a filter
 * and reports the filtered total, so "5 of 5" is a statement about the filter,
 * not about the database. These numbers come from the rows.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

const SECRETS = [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID].filter((v) => v && v.length >= 8);
const redact = (t) => SECRETS.reduce((s, x) => s.split(x).join("«redacted»"), String(t ?? ""));
const lines = [];
const say = (t = "") => { const s = redact(t); lines.push(s); console.log(s); };

const outfile = path.resolve(".proof-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/import-entry.ts"], outfile, bundle: true, format: "esm",
  platform: "node", target: "node22", logLevel: "silent",
  alias: { "@": path.resolve("src") },
  external: ["cloudflare:workers", "node:async_hooks", "node:crypto", "sharp"],
});
const app = await import(outfile);

const reach = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reach.length) throw new Error("D1 unreachable — refusing to report on nothing");

say(`# Production proof — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();

/* ---- raw row counts, straight from D1 ---- */
const kv = await app.d1All(
  "SELECT " +
    "SUM(CASE WHEN key='store:products' OR key LIKE 'store:products#%' THEN 1 ELSE 0 END) AS chunks, " +
    "SUM(CASE WHEN key LIKE 'store:product:%' THEN 1 ELSE 0 END) AS overlays, " +
    "count(*) AS total FROM store_kv",
);
say(`## store_kv`);
say();
say(`- total rows: **${kv[0].total}**`);
say(`- catalogue chunks (\`store:products\`, \`store:products#NNN\`): **${kv[0].chunks}**`);
say(`- per-product overlay rows (\`store:product:<id>\`): **${kv[0].overlays}**`);
say();

let idx = [];
try {
  idx = await app.d1All(
    "SELECT count(*) AS n, SUM(CASE WHEN hidden=1 THEN 1 ELSE 0 END) AS hidden FROM product_index",
  );
} catch (err) {
  say(`- \`product_index\` unreadable: ${String(err).slice(0, 120)}`);
}
if (idx.length) {
  say(`## product_index`);
  say();
  say(`- rows: **${idx[0].n}**`);
  say(`- rows flagged hidden: **${idx[0].hidden ?? "n/a"}**`);
  say();
}

/* ---- the catalogue as loadStore composes it ---- */
const rows = await app.d1All(
  "SELECT key, value FROM store_kv WHERE key='store:products' OR key LIKE 'store:products#%' OR key LIKE 'store:product:%'",
);
const chunks = rows.filter((r) => !String(r.key).startsWith("store:product:")).sort((a, b) => {
  const n = (k) => (String(k).includes("#") ? Number(String(k).split("#")[1]) : -1);
  return n(a.key) - n(b.key);
});
let raw = "";
for (const r of chunks) raw += String(r.value ?? "");
const live = new Map();
for (const p of JSON.parse(raw || "[]")) if (p?.id) live.set(String(p.id), p);
let tombstones = 0;
for (const r of rows.filter((r) => String(r.key).startsWith("store:product:"))) {
  let doc = null;
  try { doc = JSON.parse(String(r.value)); } catch { continue; }
  if (!doc?.id) continue;
  if (doc._deleted === true) { live.delete(String(doc.id)); tombstones++; }
  else live.set(String(doc.id), doc);
}

const isGame = (d) => {
  const cat = `${d?.categoryId ?? ""} ${d?.category ?? ""}`.toLowerCase();
  if (/hardware|accessor|amiibo|gift|console|controller/.test(cat)) return false;
  return /game/.test(cat);
};
const games = [...live.values()].filter(isGame);
const hidden = games.filter((g) => g.isHidden === true);

const indexed = new Set();
try {
  for (const r of await app.d1All("SELECT id FROM product_index")) indexed.add(String(r.id));
} catch { /* reported above */ }
const unindexed = games.filter((g) => indexed.size && !indexed.has(String(g.id)));

say(`## Live catalogue, composed the way the worker composes it`);
say();
say(`| | |`);
say(`| --- | ---: |`);
say(`| Live product documents | **${live.size}** |`);
say(`| Live Nintendo game documents | **${games.length}** |`);
say(`| Hidden Nintendo games | **${hidden.length}** |`);
say(`| Nintendo games with no \`product_index\` row | **${unindexed.length}** |`);
say(`| Deleted tombstones honoured | ${tombstones} |`);
say();

say(`### Hidden Nintendo games (${hidden.length})`);
say();
say(`| id | slug | title |`);
say(`| --- | --- | --- |`);
for (const g of hidden) say(`| \`${g.id}\` | \`${g.slug ?? ""}\` | ${g.title ?? g.name ?? ""} |`);
say();

say(`### Every canonical Nintendo game id and slug (${games.length})`);
say();
say("```");
for (const g of games.sort((a, b) => String(a.slug).localeCompare(String(b.slug)))) {
  say(`${String(g.id).padEnd(24)} ${String(g.slug ?? "").padEnd(56)} ${g.isHidden === true ? "hidden " : "visible"} ${g.title ?? g.name ?? ""}`);
}
say("```");
say();

writeFileSync("production-proof.md", lines.join("\n") + "\n");
process.exit(0);
