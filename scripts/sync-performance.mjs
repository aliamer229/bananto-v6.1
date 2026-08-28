#!/usr/bin/env node
/**
 * Syncs `devicePerformance` from product documents into the relational
 * performance tables, and reports which products fail Switch 2 validation.
 *
 * DRY RUN BY DEFAULT — `--apply` is required to write.
 *
 * The write goes through the application's own `syncGameDevicePerformance`,
 * bundled from source, talking to production D1 over the REST layer that
 * `d1.server.ts` already uses when no Worker binding is present. Nothing about
 * the row mapping is reimplemented here.
 *
 * Note on scope: syncing these tables does NOT clear "Performance review
 * required". That badge comes from `validateGameDevicePerformance`, which reads
 * the *document* and wants a `nintendo-switch-2` record carrying handheld and
 * TV resolution/FPS. This script reports those failures; filling them is
 * research, not a sync.
 */

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const BATCH = Number(
  (process.argv.find((a) => a.startsWith("--batch=")) ?? "--batch=5").split("=")[1],
);
const LIMIT = Number(
  (process.argv.find((a) => a.startsWith("--limit=")) ?? "--limit=1000").split("=")[1],
);

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

/* The app's D1 REST layer needs these three; they are the repository secrets. */
process.env.D1_DATABASE_ID ||= process.env.CLOUDFLARE_D1_DATABASE_ID || "";
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "D1_DATABASE_ID"]) {
  if (!process.env[key]) throw new Error(`missing ${key} — the REST D1 layer cannot reach production`);
}

say(`# Performance sync — ${APPLY ? "**APPLY**" : "DRY RUN (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}. Batch size ${BATCH}.`);
say();

/* Bundle the application's own performance code for Node. */
const outfile = path.resolve(".perf-sync-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/perf-sync-entry.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  logLevel: "silent",
  // Resolves the app's own "@/..." import alias.
  alias: { "@": path.resolve("src") },
  // Present only inside a Worker; the env helper already tolerates its absence.
  external: ["cloudflare:workers", "node:async_hooks", "node:crypto", "sharp"],
});
const app = await import(outfile);
say("- bundled the application's performance code");

/* The live catalogue, read through the same REST layer. */
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
say(`- live products: **${live.size}**`);

const isGame = (doc) => {
  const cat = `${doc?.categoryId ?? ""} ${doc?.category ?? ""}`.toLowerCase();
  if (/hardware|accessor|amiibo|gift|console|controller/.test(cat)) return false;
  return /game/.test(cat);
};
const games = [...live.entries()].filter(([, d]) => isGame(d));
const hardware = [...live.values()].filter((d) => /hardware/.test(`${d?.categoryId ?? ""} ${d?.category ?? ""}`.toLowerCase()));
say(`- Nintendo games: **${games.length}** · hardware products for device identity: **${hardware.length}**`);

const existing = new Map();
for (const r of await app.d1All(
  "SELECT game_id, COUNT(*) AS n FROM game_device_performance WHERE active = 1 GROUP BY game_id",
)) {
  existing.set(String(r.game_id), Number(r.n));
}

const needSync = games.filter(([id, doc]) => {
  const records = app.getDevicePerformanceList(doc);
  return records.length > 0 && (existing.get(id) ?? 0) === 0;
});
say(`- documents carrying performance with no active relational row: **${needSync.length}**`);
say();

/* Validation is a separate question from the sync; report it either way. */
const failing = games
  .map(([id, doc]) => ({ id, slug: String(doc.slug ?? ""), issues: app.validateGameDevicePerformance(doc) }))
  .filter((r) => r.issues.length);
say(`## Switch 2 validation (drives "Performance review required")`);
say();
say(`- games failing validation: **${failing.length}**`);
const reasons = new Map();
for (const f of failing) {
  for (const i of f.issues) {
    const key = String(i.message).slice(0, 90);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
}
for (const [msg, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  - ×${n} — ${msg}`);
}
say();
say("_Syncing the relational tables does not change any of these; they are document-level gaps._");
say();

say("## Sync");
say();
if (!APPLY) {
  for (const [id, doc] of needSync.slice(0, 60)) {
    say(`- \`${id}\` ${String(doc.slug ?? "").slice(0, 44)} — ${app.getDevicePerformanceList(doc).length} record(s)`);
  }
  say();
  say("**Dry run — nothing written.** Re-run with `--apply`.");
} else {
  let ok = 0;
  let failed = 0;
  const slice = needSync.slice(0, LIMIT);
  for (let i = 0; i < slice.length; i += BATCH) {
    const batch = slice.slice(i, i + BATCH);
    say(`### Batch ${Math.floor(i / BATCH) + 1} — ${batch.length} product(s)`);
    for (const [id, doc] of batch) {
      const want = app.getDevicePerformanceList(doc).length;
      try {
        await app.syncGameDevicePerformance(doc, hardware);
      } catch (err) {
        failed++;
        say(`- \`${id}\` **sync threw: ${redact(err?.message ?? err).slice(0, 120)}**`);
        continue;
      }
      // Read-after-write: the rows must actually be there.
      const after = await app.d1All(
        "SELECT COUNT(*) AS n FROM game_device_performance WHERE game_id = ? AND active = 1",
        id,
      );
      const got = Number(after?.[0]?.n ?? 0);
      if (got >= 1) {
        ok++;
        say(`- \`${id}\` ${String(doc.slug ?? "").slice(0, 40)} — ${want} record(s) → ${got} active row(s) ✓`);
      } else {
        failed++;
        say(`- \`${id}\` **verification failed: expected rows, found ${got}**`);
      }
    }
    if (failed) {
      say();
      say(`**Stopping after a failure in this batch.**`);
      break;
    }
  }
  say();
  say(`- synced and verified: **${ok}** · failed: **${failed}**`);
}

writeFileSync("sync-performance.md", lines.join("\n") + "\n");
