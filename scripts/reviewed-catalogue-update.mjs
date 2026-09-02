#!/usr/bin/env node
/**
 * Applies one manually researched batch of at most five catalogue products.
 *
 * Safety is intentionally redundant:
 * - dry-run unless both the committed manifest and the CLI say apply;
 * - immutable ids and exact pre-review document hashes;
 * - Nintendo page identity verified again at run time;
 * - commercial fields cannot be patched and are compared after the merge;
 * - existing media is retained whenever its R2 object still exists;
 * - old slugs become verified aliases before a rename;
 * - performance, identity, overlay and product_index use application code;
 * - every production write is read back before continuing.
 */

import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { buildMedia } from "./lib/media-pipeline.mjs";
import { fetchText, metadataFrom, parseStorePage } from "./lib/nintendo-store.mjs";
import {
  buildReviewedProduct,
  changedFields,
  MEDIA_ROLES,
  mediaEntries,
  mergeOnlyRequestedMedia,
  sha256Json,
  verifyExpectedSnapshot,
} from "./lib/reviewed-catalogue-update.mjs";
import { createR2 } from "./lib/r2-store.mjs";

const flag = (name, fallback) =>
  (process.argv.find((arg) => arg.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split(
    "=",
  )[1];
const MANIFEST_PATH = flag("manifest", "data/reviewed-catalogue-batch-01.json");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const requestedApply = process.argv.includes("--apply");
if (requestedApply && manifest.apply !== true) {
  throw new Error("Apply refused: the committed review manifest still has apply=false.");
}
const APPLY = requestedApply && manifest.apply === true;
const OUT = flag("out", "reviewed-catalogue-update");
const products = Array.isArray(manifest.products) ? manifest.products : [];
const ids = products.map((entry) => String(entry?.id || ""));
if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length) {
  throw new Error("A reviewed batch must contain one to five distinct immutable product ids.");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manifest.reviewedAt || ""))) {
  throw new Error("The manifest needs a reviewedAt date.");
}

const SECRETS = [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID].filter(
  (value) => value && value.length >= 8,
);
const redact = (value) =>
  SECRETS.reduce((text, secret) => text.split(secret).join("«redacted»"), String(value ?? ""));
const lines = [];
const say = (value = "") => {
  const safe = redact(value);
  lines.push(safe);
  console.log(safe);
};
const note = (value) => process.stderr.write(`${redact(value)}\n`);

mkdirSync(OUT, { recursive: true });
for (const dir of ["before", "official", "proposed", "media"]) {
  mkdirSync(path.join(OUT, dir), { recursive: true });
}
const r2 = createR2("bananto-private", { tmpDir: OUT, log: note });

process.env.D1_DATABASE_ID ||= process.env.CLOUDFLARE_D1_DATABASE_ID || "";
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "D1_DATABASE_ID"]) {
  if (!process.env[key]) throw new Error(`missing ${key}`);
}

const bundle = path.resolve(".reviewed-catalogue-update-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/reviewed-catalogue-entry.ts"],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  logLevel: "silent",
  alias: { "@": path.resolve("src") },
  external: ["cloudflare:workers", "node:async_hooks", "node:crypto", "sharp"],
});
const app = await import(bundle);

async function loadCatalogue() {
  const rows = await app.d1All(
    "SELECT key, value FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' OR key LIKE 'store:product:%'",
  );
  const chunks = rows
    .filter((row) => !String(row.key).startsWith("store:product:"))
    .sort((left, right) => {
      const number = (key) => (String(key).includes("#") ? Number(String(key).split("#")[1]) : -1);
      return number(left.key) - number(right.key);
    });
  let raw = "";
  for (const row of chunks) raw += String(row.value ?? "");
  const live = new Map();
  for (const product of JSON.parse(raw || "[]")) {
    if (product?.id) live.set(String(product.id), product);
  }
  for (const row of rows.filter((item) => String(item.key).startsWith("store:product:"))) {
    let product;
    try {
      product = JSON.parse(String(row.value));
    } catch {
      continue;
    }
    if (!product?.id) continue;
    if (product._deleted === true) live.delete(String(product.id));
    else live.set(String(product.id), product);
  }
  return live;
}

const isHardware = (product) =>
  /hardware|console|device/i.test(
    `${product?.categoryId ?? ""} ${product?.category ?? ""} ${product?.kind ?? ""}`,
  );

function platformLabel(product) {
  return String(product?.platform?.label || product?.platform?.name || product?.platform || "");
}

async function loadOfficial(entry) {
  const response = await fetchText(entry.official.url);
  if (!response.body)
    throw new Error(`Nintendo page failed for ${entry.id}: HTTP ${response.status}`);
  const urlKey = new URL(entry.official.url).pathname.match(/\/products\/([^/]+)/)?.[1] || "";
  const parsed = parseStorePage(response.body, { urlKey });
  const product = parsed?.product;
  if (!product) throw new Error(`Nintendo product payload missing for ${entry.id}`);
  const got = {
    title: String(product.name || product.title || ""),
    platform: platformLabel(product),
    nsuid: String(product.nsuid || ""),
    productCode: String(product.productCode || ""),
    titleId: String(product.applicationId || ""),
  };
  const mismatches = Object.keys(got).filter(
    (key) => got[key] !== String(entry.official[key] || ""),
  );
  if (mismatches.length) {
    throw new Error(
      `Nintendo identity mismatch for ${entry.id}: ${mismatches
        .map((key) => `${key} expected ${entry.official[key]}, found ${got[key]}`)
        .join("; ")}`,
    );
  }
  return { product, metadata: metadataFrom(product), got };
}

function ownKey(ref) {
  const value = String(ref || "").trim();
  if (value.startsWith("/api/")) return value.replace(/^\/api\//, "");
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  try {
    const url = new URL(value);
    if (/banan\.to$|r2\.dev$|r2\.cloudflarestorage\.com$/i.test(url.hostname)) {
      return url.pathname.replace(/^\/(api\/)?/, "");
    }
  } catch {
    return "";
  }
  return "";
}

async function currentRoleHealthy(value) {
  const entries = mediaEntries(value);
  if (!entries.length) return false;
  for (const ref of entries) {
    if (ref.startsWith("data:") || ref.startsWith("blob:")) return false;
    const key = ownKey(ref);
    if (key) {
      if (!(await r2.exists(key))) return false;
      continue;
    }
    try {
      const response = await fetch(ref, {
        headers: { "user-agent": "bananto-reviewed-catalogue-update", accept: "image/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (
        !response.ok ||
        !String(response.headers.get("content-type") || "").startsWith("image/")
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

async function rolesNeedingMedia(product) {
  const roles = [];
  for (const role of MEDIA_ROLES) {
    if (!(await currentRoleHealthy(product[role]))) roles.push(role);
  }
  return roles;
}

async function storeAlias(productId, oldSlug, now) {
  const normalized = String(oldSlug).toLowerCase();
  await app.d1Run(
    "INSERT INTO game_aliases (id, game_id, alias, normalized, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)" +
      " ON CONFLICT(normalized) DO UPDATE SET game_id = excluded.game_id",
    `alias_review_${String(productId).replace(/^prd_/, "")}_${sha256Json(normalized).slice(0, 8)}`,
    productId,
    oldSlug,
    normalized,
    "former_slug",
    now,
  );
  const rows = await app.d1All("SELECT game_id FROM game_aliases WHERE normalized = ?", normalized);
  if (String(rows?.[0]?.game_id || "") !== String(productId)) {
    throw new Error(`alias read-back failed for ${oldSlug}`);
  }
}

async function writeAndVerify(product, now) {
  await app.d1Run(
    "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `store:product:${product.id}`,
    JSON.stringify(product),
    now,
  );
  const rows = await app.d1All(
    "SELECT value FROM store_kv WHERE key = ?",
    `store:product:${product.id}`,
  );
  const back = rows?.[0]?.value ? JSON.parse(String(rows[0].value)) : null;
  if (!back || sha256Json(back) !== sha256Json(product)) {
    throw new Error(`overlay read-back failed for ${product.id}`);
  }
}

say(`# Reviewed catalogue batch ${manifest.batch} — ${APPLY ? "**APPLY**" : "DRY RUN"}`);
say();
say(
  `Manifest: \`${MANIFEST_PATH}\` · products: **${products.length}** · run: ${new Date().toISOString()}`,
);
say();

const reachable = await app.d1All("SELECT COUNT(*) AS n FROM store_kv");
if (!reachable.length) throw new Error("D1 is not reachable — refusing to continue");
const live = await loadCatalogue();
const hardware = [...live.values()].filter(isHardware);
say(`- live catalogue: **${live.size}** products · hardware identities: **${hardware.length}**`);
say(`- R2 read mode: **${r2.mode}**`);
say();

const proposals = [];
for (const entry of products) {
  const current = live.get(String(entry.id));
  if (!current) throw new Error(`product not found: ${entry.id}`);
  const drift = verifyExpectedSnapshot(current, entry.expected || {});
  if (drift.length) throw new Error(`production drift for ${entry.id}: ${drift.join("; ")}`);
  writeFileSync(
    path.join(OUT, "before", `${entry.id}.json`),
    `${JSON.stringify(current, null, 2)}\n`,
  );

  say(`## ${current.title} (\`${entry.id}\`)`);
  const official = await loadOfficial(entry);
  writeFileSync(
    path.join(OUT, "official", `${entry.id}.json`),
    `${JSON.stringify({ identity: official.got, metadata: official.metadata }, null, 2)}\n`,
  );
  say(
    `- Nintendo identity: **verified** — ${entry.official.title} / ${entry.official.productCode}`,
  );

  const unhealthyRoles = await rolesNeedingMedia(current);
  const forcedRoles = Array.isArray(entry.mediaRoles)
    ? entry.mediaRoles.filter((role) => MEDIA_ROLES.includes(role))
    : [];
  const requestedRoles = [...new Set([...unhealthyRoles, ...forcedRoles])];
  const identity = {
    ...current,
    ...(entry.patch || {}),
    id: entry.id,
    nsuid: entry.official.nsuid,
    nintendoEshopUrl: entry.official.url,
    eshopUrl: "",
    officialUrl: "",
  };
  const media = await buildMedia(identity, {
    sharp,
    r2,
    apply: APPLY,
    roles: requestedRoles,
    log: note,
  });
  const mediaPatch = mergeOnlyRequestedMedia(current, media.patch, requestedRoles);
  writeFileSync(
    path.join(OUT, "media", `${entry.id}.json`),
    `${JSON.stringify({ requestedRoles, ...media }, null, 2)}\n`,
  );
  const preserved = MEDIA_ROLES.filter((role) => !requestedRoles.includes(role));
  say(`- existing admin media preserved: ${preserved.length ? preserved.join(", ") : "none"}`);
  say(`- missing/dead roles researched: ${requestedRoles.join(", ") || "none"}`);
  say(`- media resolved for write: ${Object.keys(mediaPatch).join(", ") || "none"}`);
  if (media.unresolved?.length) say(`- still unresolved honestly: ${media.unresolved.join(", ")}`);

  const now = new Date().toISOString();
  const next = buildReviewedProduct({
    current,
    entry,
    metadata: official.metadata,
    commonClearFields: manifest.clearFields || [],
    mediaPatch,
    reviewedAt: manifest.reviewedAt,
    updatedAt: now,
  });
  const performanceIssues = app.validateGameDevicePerformance(next, { strict: true });
  if (performanceIssues.some((issue) => issue.severity === "error")) {
    throw new Error(
      `performance validation failed for ${entry.id}: ${performanceIssues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  const fields = changedFields(current, next);
  writeFileSync(
    path.join(OUT, "proposed", `${entry.id}.json`),
    `${JSON.stringify(next, null, 2)}\n`,
  );
  say(`- proposed changed fields (${fields.length}): ${fields.join(", ")}`);

  proposals.push({ entry, current, next, fields, now });
  say();
}

if (!APPLY) {
  say("## Result");
  say();
  say(
    "**Dry run only. D1 and R2 were not changed.** Inspect the before/proposed documents and media evidence artifact.",
  );
} else {
  say("## Applying reviewed documents");
  say();
  for (const proposal of proposals) {
    const { current, entry, next, now } = proposal;
    if (String(current.slug) !== String(next.slug)) {
      await storeAlias(entry.id, current.slug, now);
      say(`- \`${entry.id}\`: old slug \`${current.slug}\` stored and verified as an alias`);
    }
    const proposedCatalogue = [...live.values()].map((product) =>
      String(product.id) === String(next.id) ? next : product,
    );
    const identity = await app.claimProductIdentityAgainstCatalogue(next, proposedCatalogue, now);
    if (!identity.ok) {
      throw new Error(
        `identity conflict for ${entry.id}: ${identity.conflictProductId || "unknown product"}`,
      );
    }
    await writeAndVerify(next, now);
    live.set(String(next.id), next);
    await app.syncGameDevicePerformance(next, hardware);
    const active = await app.d1All(
      "SELECT COUNT(*) AS n FROM game_device_performance WHERE game_id = ? AND active = 1",
      String(next.id),
    );
    if (Number(active?.[0]?.n || 0) < 1) {
      throw new Error(`performance relation read-back failed for ${entry.id}`);
    }
    say(`- \`${entry.id}\`: overlay, identity, and performance rows written and read back`);
  }

  const rebuilt = await app.rebuildProductIndex([...live.values()], Date.now());
  const indexed = await app.d1All(
    `SELECT id FROM product_index WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  if (new Set(indexed.map((row) => String(row.id))).size !== ids.length) {
    throw new Error("product_index read-back did not contain every reviewed product");
  }
  say(`- product_index rebuilt through application code: **${rebuilt}** rows`);
  say();
  say(`**Applied and verified ${proposals.length} reviewed product(s).**`);
}

writeFileSync(path.join(OUT, "report.md"), `${lines.join("\n")}\n`);
