#!/usr/bin/env node
/**
 * Puts product documents back the way a run found them.
 *
 * DRY RUN BY DEFAULT — `--apply` is required to write.
 *
 * Every write in this work uploads the pre-change document as an artifact
 * before it touches the row. This reads those artifacts back and restores them,
 * which is what makes the writes reversible rather than merely careful.
 *
 * It exists because one was needed. The title comparison accepted containment,
 * so "Xenoblade Chronicles 2" matched the page for "Xenoblade Chronicles:
 * Definitive Edition" — the edition words come off the second one, and the
 * first contains what is left. That put one game's screenshots, download size
 * and release date onto another game. The comparison is exact now, and this
 * undoes the run that used the loose one.
 *
 * Restoring is unconditional and wholesale: every document in the directory
 * goes back, not only the one known to be wrong. A rule that was loose enough
 * to match the wrong page once cannot be trusted to have been tight everywhere
 * else, and the correct products are re-researched immediately afterwards at no
 * cost beyond time.
 */

import { build } from "esbuild";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const DIR = flag("from", "restore-input");
const ONLY = flag("products", "");

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

const outfile = path.resolve(".restore-bundle.mjs");
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

say(`# Product restore — ${APPLY ? "**APPLY**" : "DRY RUN (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}. Reading pre-change documents from \`${DIR}\`.`);
say();

const reachable = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reachable.length) throw new Error("D1 is not reachable — refusing to run against nothing");

/* The artifacts unpack either flat or one directory per artifact name. */
function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (/\.before\.json$/.test(entry.name)) found.push(full);
  }
  return found;
}

if (!existsSync(DIR)) throw new Error(`no such directory: ${DIR}`);
const files = collect(DIR);
const wanted = new Set(ONLY.split(",").map((s) => s.trim()).filter(Boolean));
say(`- Pre-change documents found: **${files.length}**`);
if (wanted.size) say(`- Restricted to ${wanted.size} product id(s)`);
say();
if (!files.length) throw new Error(`no *.before.json under ${DIR} — nothing to restore`);

/*
  The same product can appear in more than one artifact if it was written by
  more than one run. The earliest copy is the one to restore — it is the state
  before any of this touched it — and artifact directories sort by run.
*/
const byId = new Map();
for (const file of files.sort()) {
  const id = path.basename(file).replace(/\.before\.json$/, "");
  if (!byId.has(id)) byId.set(id, file);
}

let restored = 0;
let failed = 0;
let skipped = 0;
let identical = 0;

for (const [id, file] of byId) {
  if (wanted.size && !wanted.has(id)) {
    skipped++;
    continue;
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    failed++;
    say(`- \`${id}\`: **unreadable pre-change document** (${String(err).slice(0, 80)})`);
    continue;
  }
  if (String(doc?.id ?? "") !== id) {
    failed++;
    say(`- \`${id}\`: **refusing to restore** — the document inside names \`${doc?.id}\``);
    continue;
  }

  const before = JSON.stringify(doc);
  const current = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${id}`);
  if (current?.[0]?.value === before) {
    identical++;
    continue;
  }

  const label = `${doc.title ?? doc.name ?? id} (${doc.slug ?? "no slug"})`;
  if (!APPLY) {
    say(`- \`${id}\` ${label}: would be restored`);
    restored++;
    continue;
  }
  try {
    await app.d1Run(
      "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      `store:product:${id}`,
      before,
      new Date().toISOString(),
    );
  } catch (err) {
    failed++;
    say(`- \`${id}\` ${label}: **write failed** — ${String(err).slice(0, 140)}`);
    continue;
  }
  const back = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${id}`);
  if (back?.[0]?.value === before) {
    restored++;
    say(`- \`${id}\` ${label}: restored and verified byte for byte`);
  } else {
    failed++;
    say(`- \`${id}\` ${label}: **read-after-write verification failed**`);
  }
}

say();
say(`## Summary`);
say();
say(`| | |`);
say(`| --- | ---: |`);
say(`| Pre-change documents | ${byId.size} |`);
say(`| Restored${APPLY ? " and verified" : " (dry run)"} | ${restored} |`);
say(`| Already identical to production | ${identical} |`);
say(`| Skipped by the product filter | ${skipped} |`);
say(`| Failures | ${failed} |`);
say();
if (!APPLY) say(`**Dry run — nothing written.** Re-run with \`--apply\`.`);

writeFileSync("restore-products.md", lines.join("\n") + "\n");
process.exit(failed > 0 ? 1 : 0);
