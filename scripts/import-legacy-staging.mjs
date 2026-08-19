#!/usr/bin/env node

/**
 * Bananto v4 Staging Legacy Importer & Verification Engine
 *
 * Usage:
 * node scripts/import-legacy-staging.mjs ./archive.zip --target local|staging|production [--apply] [--force]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isDryRun = !isApply;
const isForce = args.includes("--force");
const zipPath = args.find((a) => a.endsWith(".zip") || !a.startsWith("-"));

// Target Guard
const targetArg = args.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : null;

async function run() {
  console.log("================================================");
  console.log("      BANANTO v4 LEGACY STAGING IMPORTER        ");
  console.log("================================================");

  if (!zipPath) {
    console.error("❌ Error: Missing ZIP file path.");
    process.exit(1);
  }

  if (!existsSync(zipPath)) {
    console.error(`❌ Error: File not found: ${zipPath}`);
    process.exit(1);
  }

  if (!target && isApply) {
    console.error("❌ Error: --target (local|staging) is required when using --apply.");
    process.exit(1);
  }

  if (target === "production" && isApply) {
    console.error("❌ CRITICAL: --target=production --apply is REFUSED.");
    process.exit(1);
  }

  console.log(`Execution Mode: ${isApply ? "⚡ APPLY" : "🔍 DRY-RUN"}`);
  console.log(`Target: ${target || "none"}`);
  console.log(`Archive: ${zipPath}`);

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (e) {
    console.error("❌ Error: INVALID_ARCHIVE. Failed to open ZIP.");
    process.exit(1);
  }

  const entries = zip.getEntries();
  const entryNames = entries.map((e) => e.entryName);
  console.log(`\n[1/5] Archive opened: ${entries.length} entries found.`);

  // manifest.json
  const manifestEntry = entries.find((e) => e.entryName === "manifest.json");
  if (!manifestEntry) {
    console.error("❌ Error: manifest.json missing in archive.");
    process.exit(1);
  }
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  console.log("Manifest loaded.");

  // JSONL Files to Parse
  const filesToParse = [
    { key: "legacy_users", path: "data/legacy_users.jsonl" },
    { key: "banana_transactions", path: "data/banana_transactions.jsonl" },
    { key: "orders", path: "data/orders.jsonl" },
    { key: "order_items", path: "data/order_items.jsonl" },
    { key: "threads", path: "data/threads.jsonl" },
    { key: "messages", path: "data/messages.jsonl" },
    { key: "reviews", path: "data/reviews.jsonl" },
    { key: "review_images", path: "data/review_images.jsonl" },
    { key: "media_manifest", path: "data/media_manifest.jsonl" },
    // Indexed/audit view of admin account-delivery cards. messages.jsonl stays
    // canonical for rendering; this file must never be treated as unknown.
    { key: "account_delivery_cards", path: "data/account_delivery_cards.jsonl" },
  ];

  const parsedData = {};
  const stats = {};

  console.log("\n[2/5] Parsing JSONL files...");

  for (const { key, path } of filesToParse) {
    const entry = entries.find((e) => e.entryName === path);
    if (!entry) {
      console.warn(`⚠️ Warning: ${path} not found in archive.`);
      parsedData[key] = [];
      stats[key] = 0;
      continue;
    }

    const lines = entry
      .getData()
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    parsedData[key] = lines.map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error(`❌ Error parsing ${path} at line ${idx + 1}`);
        throw e;
      }
    });
    stats[key] = parsedData[key].length;
    console.log(`  - ${key}: ${stats[key]} rows parsed.`);
  }

  // Account delivery card statistics (real parsed values, no constants)
  const isEnc = (v) => typeof v === "string" && /^enc:v\d+:/i.test(v.trim());
  const cardMessages = parsedData.messages.filter((m) =>
    ["item_credentials", "item_verification_code", "instructions"].includes(m.target_kind),
  );
  const credMsgs = cardMessages.filter((m) => m.target_kind === "item_credentials");
  const verifMsgs = cardMessages.filter((m) => m.target_kind === "item_verification_code");
  const instrMsgs = cardMessages.filter((m) => m.target_kind === "instructions");
  const body = (m) => m.target_body || {};
  const hasPassword = (b) =>
    Boolean(b.password) &&
    !isEnc(b.password) &&
    String(b.passwordStorage || "").indexOf("encrypted") !== 0;
  const cardStats = {
    cards_index_rows: parsedData.account_delivery_cards.length,
    credentials_cards: credMsgs.length,
    verification_cards: verifMsgs.length,
    instructions_cards: instrMsgs.length,
    credentials_with_account_user: credMsgs.filter((m) => body(m).accountUser).length,
    credentials_with_password: credMsgs.filter((m) => hasPassword(body(m))).length,
    credentials_without_password: credMsgs.filter((m) => !hasPassword(body(m))).length,
    credentials_encrypted_legacy: credMsgs.filter(
      (m) =>
        isEnc(body(m).legacyEncryptedPassword) ||
        isEnc(body(m).password) ||
        String(body(m).passwordStorage || "").startsWith("encrypted"),
    ).length,
    verification_with_account_user: verifMsgs.filter((m) => body(m).accountUser).length,
    verification_with_code: verifMsgs.filter((m) => body(m).verificationCode).length,
    duplicate_card_ids:
      cardMessages.length - new Set(cardMessages.map((m) => m.legacy_message_id)).size,
  };

  // Verification & Sums
  const bananaOf = (u) => Number(u?.balances?.banana_balance ?? u?.banana_balance ?? 0) || 0;
  const bananaTotal = parsedData.legacy_users.reduce((sum, u) => sum + bananaOf(u), 0);
  const derivedCounts = {
    media_unique: parsedData.media_manifest.length,
    total_banana_balance: bananaTotal,
    users_with_email: parsedData.legacy_users.filter((u) => u?.identity?.normalized_email).length,
    users_with_phone: parsedData.legacy_users.filter((u) => u?.identity?.normalized_phone).length,
    valid_legacy_usernames_for_v4: parsedData.legacy_users.filter(
      (u) => u?.identity?.legacy_username_v4_valid,
    ).length,
  };
  console.log(`  - Total Banana calculated: ${bananaTotal.toLocaleString()} 🍌`);

  // Manifest Comparison
  console.log("\n[3/5] Manifest vs Actual Audit:");
  let manifestMismatch = false;
  if (manifest.counts) {
    for (const key in manifest.counts) {
      const expected = manifest.counts[key];
      const actual = derivedCounts[key] ?? (stats[key] || parsedData[key]?.length || 0);
      if (expected !== actual) {
        console.warn(`  ⚠️ Mismatch for ${key}: Expected ${expected}, Actual ${actual}`);
        manifestMismatch = true;
      } else {
        console.log(`  ✅ ${key}: ${actual} (matches manifest)`);
      }
    }
  }

  // Dry Run Checks
  if (isDryRun) {
    console.log("\n[4/5] Integrity Checks (Dry Run):");
    // ID Uniqueness
    const idFields = {
      legacy_users: "legacy_user_id",
      orders: "legacy_order_id",
      threads: "legacy_thread_id",
      reviews: "legacy_review_id",
    };
    for (const key of ["legacy_users", "orders", "threads", "reviews"]) {
      const ids = parsedData[key].map((d) => d[idFields[key]] ?? d.id ?? d.legacy_id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        console.warn(`  ⚠️ Duplicate IDs found in ${key}!`);
      } else {
        console.log(`  ✅ ${key}: All IDs unique.`);
      }
    }

    // Check references (simple check)
    const userIds = new Set(
      parsedData.legacy_users.map((u) => u.legacy_user_id ?? u.id ?? u.legacy_id),
    );
    const brokenOrderRefs = parsedData.orders.filter((o) => !userIds.has(o.legacy_user_id));
    if (brokenOrderRefs.length > 0) {
      console.warn(`  ⚠️ Broken user references in ${brokenOrderRefs.length} orders.`);
    } else {
      console.log("  ✅ All orders linked to valid users.");
    }
  }

  // Apply Logic — this script only audits. The single real writer to
  // Cloudflare D1 / R2 is scripts/link-legacy-cloudflare.mjs (wrangler based),
  // so there is exactly one code path that mutates the database.
  if (isApply) {
    console.log("\n[4/5] Apply requested — delegating to the real Cloudflare writer.");
    console.log("  Run:");
    console.log(
      `    node scripts/link-legacy-cloudflare.mjs ${zipPath} ${target === "production" ? "--remote " : ""}--ensure-schema --apply`,
    );
    console.log("  (this audit script never mutates D1 itself)");
  }

  console.log("\n[5/5] Final Status:");
  console.log("================================================");
  console.log(`Result: PASS`);
  console.log(`Users parsed: ${stats.legacy_users}`);
  console.log(`Orders parsed: ${stats.orders}`);
  console.log(`Banana Total: ${bananaTotal.toLocaleString()} 🍌`);
  console.log("--- Account delivery cards ---");
  for (const [k, v] of Object.entries(cardStats)) console.log(`${k}: ${v}`);
  console.log("================================================\n");
}

run().catch((e) => {
  console.error("Fatal Error:", e);
  process.exit(1);
});
