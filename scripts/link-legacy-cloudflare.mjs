#!/usr/bin/env node

/**
 * Links every imported legacy user (and their orders, threads, messages,
 * reviews, banana history and media references) to the real Cloudflare stack:
 *
 *   - D1  : writes the legacy_* staging tables through `wrangler d1 execute`
 *   - R2  : registers media references (bucket + key + access policy) only.
 *           No object is uploaded and no private object is ever made public.
 *
 * Legacy people are NEVER inserted into the live `users` table: they stay in
 * `legacy_users` until the real owner signs in and passes the claim flow.
 *
 * Usage:
 *   node scripts/link-legacy-cloudflare.mjs <archive.zip|folder> [options]
 *
 * Options:
 *   --remote            write to the real Cloudflare D1 database (default: --local)
 *   --local             write to the local wrangler D1 (default)
 *   --apply             actually execute; without it the script is a dry run
 *   --ensure-schema     run migrations/0035 + 0036 first (idempotent)
 *   --verify-only       only read counts back from D1 and print the report
 *   --chunk=<n>         statements per SQL file (default 400)
 *   --out=<dir>         where SQL + report files are written (default .legacy-link)
 *
 * Examples:
 *   node scripts/link-legacy-cloudflare.mjs ./bananto_v4_legacy_import_ready_with_account_cards.zip
 *   node scripts/link-legacy-cloudflare.mjs ./archive.zip --remote --ensure-schema --apply
 *   node scripts/link-legacy-cloudflare.mjs ./archive.zip --remote --verify-only
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchive, buildStatements, chunkStatements } from "./lib/legacy-dataset.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const archivePath = args.find((a) => !a.startsWith("--"));
const isRemote = flag("remote");
const isApply = flag("apply");
const ensureSchema = flag("ensure-schema");
const verifyOnly = flag("verify-only");
const chunkSize = Math.max(50, Number(value("chunk", "400")) || 400);
const outDir = resolve(value("out", ".legacy-link"));

const DB = "bananto";
const TABLES = [
  "legacy_users",
  "legacy_banana_transactions",
  "legacy_orders",
  "legacy_order_items",
  "legacy_threads",
  "legacy_messages",
  "legacy_reviews",
  "legacy_review_images",
  "legacy_media",
];

function wrangler(extra) {
  const argv = ["wrangler", "d1", "execute", DB, isRemote ? "--remote" : "--local", "-y", ...extra];
  return execFileSync("npx", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function query(sql) {
  const raw = wrangler(["--json", "--command", sql]);
  const start = raw.indexOf("[");
  if (start < 0) throw new Error(`UNEXPECTED_WRANGLER_OUTPUT: ${raw.slice(0, 400)}`);
  const parsed = JSON.parse(raw.slice(start));
  return parsed?.[0]?.results ?? [];
}

function readCounts() {
  const counts = {};
  for (const table of TABLES) {
    try {
      counts[table] = Number(query(`SELECT COUNT(*) AS c FROM ${table}`)[0]?.c ?? 0);
    } catch {
      counts[table] = null; // table missing
    }
  }
  try {
    const row = query(
      "SELECT COALESCE(SUM(banana_balance),0) AS total, SUM(CASE WHEN claim_state='claimed' THEN 1 ELSE 0 END) AS claimed FROM legacy_users",
    )[0];
    counts.total_banana_balance = Number(row?.total ?? 0);
    counts.claimed_users = Number(row?.claimed ?? 0);
  } catch {
    counts.total_banana_balance = null;
    counts.claimed_users = null;
  }
  try {
    const rows = query(
      "SELECT v4_target_storage AS storage, COUNT(*) AS c FROM legacy_media GROUP BY v4_target_storage",
    );
    counts.media_by_bucket = Object.fromEntries(rows.map((r) => [r.storage, Number(r.c)]));
  } catch {
    counts.media_by_bucket = null;
  }
  return counts;
}

function banner(title) {
  console.log(`\n${"=".repeat(56)}\n${title}\n${"=".repeat(56)}`);
}

function main() {
  banner("BANANTO — LINK LEGACY USERS TO CLOUDFLARE D1 + R2");
  console.log(
    `Environment : ${isRemote ? "REMOTE (real Cloudflare D1)" : "LOCAL (wrangler local D1)"}`,
  );
  console.log(
    `Mode        : ${verifyOnly ? "VERIFY ONLY" : isApply ? "APPLY" : "DRY RUN (add --apply to write)"}`,
  );

  if (verifyOnly) {
    const counts = readCounts();
    banner("D1 VERIFICATION");
    console.log(JSON.stringify(counts, null, 2));
    return;
  }

  if (!archivePath) {
    console.error(
      "❌ Missing archive path. Usage: node scripts/link-legacy-cloudflare.mjs <archive.zip|folder> [--remote --apply]",
    );
    process.exit(1);
  }

  const dataset = readArchive(archivePath);
  console.log(`Archive     : ${dataset.source}`);
  if (dataset.missing.length) console.warn(`⚠️  Missing files: ${dataset.missing.join(", ")}`);

  banner("PARSED SOURCE DATA");
  for (const [key, count] of Object.entries(dataset.counts))
    console.log(`  ${key.padEnd(24)} ${count}`);
  console.log(`  ${"total_banana_balance".padEnd(24)} ${dataset.bananaTotal.toLocaleString()} 🍌`);

  const groups = buildStatements(dataset);
  const chunks = chunkStatements(groups, chunkSize);
  const totalStatements = groups.reduce((n, g) => n + g.statements.length, 0);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const files = chunks.map((chunk, i) => {
    const file = join(
      outDir,
      `${String(i + 1).padStart(3, "0")}_${chunk.table}_${chunk.index}.sql`,
    );
    writeFileSync(file, `${chunk.sql}\n`, "utf8");
    return { file, ...chunk };
  });

  banner("SQL PLAN");
  for (const g of groups) console.log(`  ${g.table.padEnd(28)} ${g.statements.length} rows`);
  console.log(
    `  ${"TOTAL".padEnd(28)} ${totalStatements} statements in ${files.length} files → ${outDir}`,
  );

  if (!isApply) {
    console.log("\n🔍 Dry run complete. Nothing was written to Cloudflare.");
    console.log(
      `   Re-run with: node scripts/link-legacy-cloudflare.mjs ${archivePath} ${isRemote ? "--remote " : ""}--ensure-schema --apply`,
    );
    return;
  }

  if (ensureSchema) {
    banner("ENSURING LEGACY SCHEMA");
    for (const migration of [
      "migrations/0035_legacy_migration.sql",
      "migrations/0036_legacy_claim_hardening.sql",
    ]) {
      if (!existsSync(migration)) continue;
      try {
        wrangler(["--file", migration]);
        console.log(`  ✅ ${migration}`);
      } catch (err) {
        // 0036 uses ALTER TABLE ADD COLUMN which fails when already applied.
        console.log(`  ⏭️  ${migration} (already applied)`);
      }
    }
  }

  banner("WRITING TO D1");
  let written = 0;
  for (const f of files) {
    wrangler(["--file", f.file]);
    written += f.count;
    console.log(`  ✅ ${f.table} +${f.count} (${written}/${totalStatements})`);
  }

  banner("D1 VERIFICATION");
  const counts = readCounts();
  console.log(JSON.stringify(counts, null, 2));

  const mismatches = [];
  const expected = {
    legacy_users: dataset.counts.legacy_users,
    legacy_banana_transactions: dataset.counts.banana_transactions,
    legacy_orders: dataset.counts.orders,
    legacy_order_items: dataset.counts.order_items,
    legacy_threads: dataset.counts.threads,
    legacy_messages: dataset.counts.messages,
    legacy_reviews: dataset.counts.reviews,
    legacy_review_images: dataset.counts.review_images,
    legacy_media: dataset.counts.media_manifest,
  };
  for (const [table, want] of Object.entries(expected)) {
    if (counts[table] !== want)
      mismatches.push(`${table}: expected ${want}, found ${counts[table]}`);
  }
  if (counts.total_banana_balance !== dataset.bananaTotal) {
    mismatches.push(
      `total_banana_balance: expected ${dataset.bananaTotal}, found ${counts.total_banana_balance}`,
    );
  }

  const report = {
    generated_at: new Date().toISOString(),
    environment: isRemote ? "remote" : "local",
    archive: dataset.source,
    manifest_version: dataset.manifest?.format_version ?? null,
    source_counts: dataset.counts,
    source_banana_total: dataset.bananaTotal,
    d1_counts: counts,
    r2_policy: "references_only_no_uploads",
    mismatches,
    result: mismatches.length ? "MISMATCH" : "PASS",
  };
  const reportPath = join(outDir, "link-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  banner(`RESULT: ${report.result}`);
  for (const m of mismatches) console.warn(`  ⚠️ ${m}`);
  console.log(`Report: ${reportPath}`);
  if (mismatches.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`\n❌ Fatal: ${err.message}`);
  process.exit(1);
}
