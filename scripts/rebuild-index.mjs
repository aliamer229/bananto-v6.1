#!/usr/bin/env node
/**
 * Rebuilds `product_index` from the live catalogue.
 *
 * DRY RUN BY DEFAULT — `--apply` is required to write.
 *
 * Two things are wrong with the current index and both are stale data rather
 * than missing data. Five live products have no row at all, so they are
 * invisible in the admin list while being visible on the storefront. And
 * `performance_required` is set on products that pass
 * `validateGameDevicePerformance` today — the "Performance review required"
 * badge is the index remembering a state the documents have since left.
 *
 * The rows are built by the application's own `toIndexRow`, so the projection
 * matches what the Worker writes on any ordinary save.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

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

say(`# product_index rebuild — ${APPLY ? "**APPLY**" : "DRY RUN (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();

const outfile = path.resolve(".index-rebuild-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/index-rebuild-entry.ts"],
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

/* Live catalogue, exactly as loadStore composes it. */
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
for (const p of JSON.parse(aggregate || "[]")) if (p?.id) live.set(String(p.id), p);
for (const row of overlays) {
  let doc = null;
  try {
    doc = JSON.parse(row.value);
  } catch {
    continue;
  }
  if (!doc?.id) continue;
  if (doc._deleted === true) live.delete(String(doc.id));
  else live.set(String(doc.id), doc);
}
const products = [...live.values()];
say(`- live products: **${products.length}**`);

const before = await app.d1All("SELECT id, performance_required FROM product_index");
const indexed = new Set(before.map((r) => String(r.id)));
const flaggedBefore = before.filter((r) => Number(r.performance_required) === 1).length;
say(`- \`product_index\` rows now: **${before.length}** (flagged performance_required: **${flaggedBefore}**)`);

const missing = products.filter((p) => !indexed.has(String(p.id)));
const stale = [...indexed].filter((id) => !live.has(id));
say(`- live but unindexed: **${missing.length}** — ${missing.map((p) => p.slug).join(", ") || "none"}`);
say(`- indexed but no longer live: **${stale.length}** — ${stale.join(", ") || "none"}`);

/* What the projection will say, computed with the Worker's own mapping. */
const projected = products.map((p) => app.toIndexRow(p));
const flaggedAfter = projected.filter((r) => r.performanceRequired).length;
say(`- flagged performance_required after rebuild: **${flaggedAfter}** (was ${flaggedBefore})`);
const nowFlagged = projected.filter((r) => r.performanceRequired).map((r) => r.slug || r.id);
if (nowFlagged.length) say(`  - still flagged: ${nowFlagged.slice(0, 40).join(", ")}`);
say();

if (!APPLY) {
  say("**Dry run — nothing written.** Re-run with `--apply`.");
} else {
  const rev = Date.now();
  const written = await app.rebuildProductIndex(products, rev);
  const after = await app.d1All("SELECT id, performance_required FROM product_index");
  const flaggedNow = after.filter((r) => Number(r.performance_required) === 1).length;
  const stillMissing = products.filter((p) => !new Set(after.map((r) => String(r.id))).has(String(p.id)));
  say(`- rebuilt: **${written}** rows written`);
  say(`- \`product_index\` rows now: **${after.length}** · flagged performance_required: **${flaggedNow}**`);
  say(`- live products still unindexed: **${stillMissing.length}** — ${stillMissing.map((p) => p.slug).join(", ") || "none"}`);
  if (after.length === products.length && stillMissing.length === 0) {
    say("- **verified: every live product has an index row**");
  } else {
    say("- **VERIFICATION FAILED — index does not cover the live catalogue**");
    process.exitCode = 1;
  }
}

writeFileSync("rebuild-index.md", lines.join("\n") + "\n");
