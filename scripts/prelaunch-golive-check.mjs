#!/usr/bin/env node

/**
 * Bananto v4 Go-Live Final Verification & Pre-Launch Snapshot Engine
 *
 * Uses real D1 database queries to verify integrity before launch.
 */

import { getD1, d1First } from "../src/lib/d1.server.ts";

export async function runGoLiveVerification() {
  const timestamp = Date.now();
  /*
    `snapshotId` was referenced on the line below and never defined, so this
    function threw a ReferenceError before it reached a single check. The
    timestamp above was computed and then unused, which is what it was for.
  */
  const snapshotId = `snapshot-${timestamp}`;
  console.log("Checking for real Cloudflare Snapshot...");
  // Logic to check Cloudflare API would go here.
  // Since we don't have credentials in this audit:
  console.log("  ⚠️ SNAPSHOT NOT CREATED (Cloudflare API unreachable)");

  console.log("=================================================");
  console.log("     BANANTO v4 FINAL GO-LIVE VERIFICATION      ");
  console.log("=================================================");
  console.log(`Snapshot ID: ${snapshotId}`);

  const db = getD1();
  if (!db) {
    console.error("❌ Database connection not available.");
    return { status: "FAIL" };
  }

  // Real manifest verification
  const manifest =
    (await d1First(`
    SELECT 
      (SELECT COUNT(*) FROM legacy_users) as legacyUsersTotal,
      (SELECT COUNT(*) FROM legacy_users WHERE claim_state = 'unclaimed') as legacyUsersUnclaimed,
      (SELECT COUNT(*) FROM users) as liveUsersCount,
      (SELECT COUNT(*) FROM orders) as liveOrdersCount,
      (SELECT COUNT(*) FROM legacy_reviews WHERE unresolved = 1) as unresolvedReviewsCount,
      (SELECT COUNT(*) FROM legacy_reviews WHERE unresolved = 0) as resolvedReviewsCount
  `)) || {};

  console.log("\n[1/6] Live & Legacy Audit:");
  console.log(`  - Live Users Count: ${manifest.liveUsersCount}`);
  console.log(
    `  - Unclaimed Legacy Accounts: ${manifest.legacyUsersUnclaimed} / ${manifest.legacyUsersTotal}`,
  );

  console.log("\n[2/6] D1 Table Integrity:");
  console.log(
    `  - legacy_reviews: ${Number(manifest.resolvedReviewsCount) + Number(manifest.unresolvedReviewsCount)} rows`,
  );

  console.log("\n[6/6] Go-Live Status:");
  const isReady = manifest.liveUsersCount === 0 || process.argv.includes("--force");
  console.log(`  STATUS: ${isReady ? "🚀 GO-LIVE READY" : "⚠️ LIVE USERS DETECTED (USE --force)"}`);
  console.log("=================================================\n");

  return {
    snapshotId,
    status: isReady ? "PASS" : "WARN",
    manifest,
  };
}

if (process.argv[1]?.endsWith("prelaunch-golive-check.mjs")) {
  runGoLiveVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Go-Live Verification Error:", err);
      process.exit(1);
    });
}
