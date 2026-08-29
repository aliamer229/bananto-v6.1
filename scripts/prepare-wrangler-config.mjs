#!/usr/bin/env node
/**
 * Automatically validates and syncs wrangler.jsonc with production Cloudflare bindings.
 * Resolves the existing 'bananto' D1 database UUID from environment or Cloudflare API.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG_PATH = resolve("wrangler.jsonc");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveD1DatabaseId() {
  // 1. Direct environment variable
  const envId = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID;
  if (envId && UUID_REGEX.test(envId.trim())) {
    return envId.trim();
  }

  // 2. Fetch from Cloudflare REST API if account & token exist
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (accountId && token) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.result)) {
        const banantoDb = data.result.find((db) => db.name === "bananto");
        if (banantoDb?.uuid && UUID_REGEX.test(banantoDb.uuid)) {
          return banantoDb.uuid;
        }
      }
    } catch (e) {
      console.warn("[prepare-wrangler] Could not query Cloudflare D1 API:", e?.message || e);
    }
  }

  // 3. Fallback: check existing wrangler.jsonc database_id
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const json = JSON.parse(raw);
    const existingId = json.d1_databases?.[0]?.database_id;
    if (existingId && UUID_REGEX.test(existingId)) {
      return existingId;
    }
  } catch (err) {
    // Ignore read/parse error for initial check
    return null;
  }

  return null;
}

export async function prepareWranglerConfig() {
  console.log("==> Preparing and validating wrangler.jsonc configuration...");

  let config;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    config = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to parse wrangler.jsonc:", err);
    process.exit(1);
  }

  // Enforce required base settings
  config.name = config.name || "pixel-cart-cloud";
  config.main = "dist/server/server.js";
  config.compatibility_date = config.compatibility_date || "2026-08-28";
  config.compatibility_flags = ["nodejs_compat"];
  config.assets = {
    directory: "dist/client",
    binding: "ASSETS",
  };
  config.observability = { enabled: true };

  // Resolve D1 database ID
  const d1Id = await resolveD1DatabaseId();
  if (d1Id) {
    console.log(`✓ Resolved D1 database_id for 'bananto': ${d1Id.slice(0, 8)}...`);
    config.d1_databases = [
      {
        binding: "bananto",
        database_name: "bananto",
        database_id: d1Id,
      },
    ];
  } else {
    console.log("ℹ️ D1 database UUID will be verified or supplied by deployment environment.");
  }

  // Verify and enforce R2 Buckets
  config.r2_buckets = [
    {
      binding: "BANANTO_BUCKET",
      bucket_name: "bananto",
    },
    {
      binding: "BANANTO_PRIVATE_BUCKET",
      bucket_name: "bananto-private",
    },
  ];

  // Verify and enforce Durable Objects
  config.durable_objects = {
    bindings: [
      {
        name: "CHAT_REALTIME_DO",
        class_name: "ChatRealtimeDO",
      },
    ],
  };

  config.migrations = [
    {
      tag: "v1",
      new_classes: ["ChatRealtimeDO"],
    },
  ];

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log("✓ wrangler.jsonc updated and verified successfully.");
}

if (process.argv[1]?.endsWith("prepare-wrangler-config.mjs")) {
  prepareWranglerConfig().catch((err) => {
    console.error("❌ Error in prepare-wrangler-config:", err);
    process.exit(1);
  });
}
