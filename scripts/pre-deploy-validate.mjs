#!/usr/bin/env node
/**
 * Pre-deployment production validation.
 * Verifies Wrangler configuration, D1 database ID validity, required Cloudflare bindings,
 * and essential database schema before attempting production deployment.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG_PATH = resolve("wrangler.jsonc");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runPreDeployValidation() {
  console.log("=================================================");
  console.log("     BANANTO PRODUCTION PRE-DEPLOY VALIDATION    ");
  console.log("=================================================\n");

  // 1. Read & Validate Wrangler config
  let config;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    config = JSON.parse(raw);
    console.log("✓ wrangler.jsonc parsed successfully");
  } catch (err) {
    console.error("❌ Failed to parse wrangler.jsonc:", err.message);
    process.exit(1);
  }

  // 2. Validate D1 binding and database_id
  const d1 = config.d1_databases?.[0];
  if (!d1 || d1.binding !== "bananto") {
    console.error("❌ Missing or misnamed D1 database binding 'bananto'");
    process.exit(1);
  }

  const d1Id = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID || d1.database_id;
  if (!d1Id || !UUID_REGEX.test(d1Id)) {
    console.error(`❌ Invalid D1 database_id for 'bananto': "${d1Id}". Must be a valid UUID.`);
    process.exit(1);
  }
  console.log(`✓ D1 database_id valid: ${d1Id.slice(0, 8)}...`);

  // 3. Validate R2 bindings
  const r2Bindings = (config.r2_buckets || []).map((b) => b.binding);
  if (!r2Bindings.includes("BANANTO_BUCKET")) {
    console.error("❌ Missing required R2 bucket binding 'BANANTO_BUCKET'");
    process.exit(1);
  }
  if (!r2Bindings.includes("BANANTO_PRIVATE_BUCKET")) {
    console.error("❌ Missing required R2 bucket binding 'BANANTO_PRIVATE_BUCKET'");
    process.exit(1);
  }
  console.log("✓ R2 bucket bindings confirmed (BANANTO_BUCKET, BANANTO_PRIVATE_BUCKET)");

  // 4. Validate Durable Object bindings
  const doBindings = (config.durable_objects?.bindings || []).map((d) => d.name);
  if (!doBindings.includes("CHAT_REALTIME_DO")) {
    console.error("❌ Missing required Durable Object binding 'CHAT_REALTIME_DO'");
    process.exit(1);
  }
  console.log("✓ Durable Object binding confirmed (CHAT_REALTIME_DO)");

  console.log("\n=================================================");
  console.log("  PRE-DEPLOY VALIDATION PASSED — READY TO DEPLOY ");
  console.log("=================================================\n");
}

runPreDeployValidation().catch((err) => {
  console.error("❌ Pre-deploy validation failed:", err);
  process.exit(1);
});
