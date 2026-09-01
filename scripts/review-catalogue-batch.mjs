#!/usr/bin/env node
/**
 * Read-only evidence pack for one manually reviewed catalogue batch.
 *
 * The manifest is capped at five immutable product ids. The script copies the
 * exact live overlay documents and attempts to download every current image
 * role, recording dimensions and failures. It never executes a mutating D1 or
 * R2 command. This is the evidence used to preserve valid admin artwork.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DB_NAME = "bananto";
const CONFIG = "wrangler.jsonc";
const OUT = "catalogue-review-batch";
const manifest = JSON.parse(readFileSync("data/catalogue-review-batch.json", "utf8"));
const ids = Array.isArray(manifest.products) ? manifest.products.map(String) : [];
if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length) {
  throw new Error("The review manifest must contain one to five distinct product ids.");
}

const WRANGLER = existsSync("node_modules/.bin/wrangler")
  ? "node_modules/.bin/wrangler"
  : "wrangler";
const ENV = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
const MUTATING =
  /(^|[^_\w])(insert|update|delete|replace|upsert|alter|drop|create|attach|detach|vacuum|reindex|truncate)([^_\w]|$)/i;

function d1(sql) {
  if (!/^\s*select\b/i.test(sql) || MUTATING.test(sql) || sql.replace(/;\s*$/, "").includes(";")) {
    throw new Error(`REFUSED non-read query: ${sql.slice(0, 80)}`);
  }
  const raw = execFileSync(
    WRANGLER,
    ["d1", "execute", DB_NAME, "--remote", "--json", "--yes", "--config", CONFIG, "--command", sql],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, env: ENV, timeout: 120_000 },
  );
  const start = raw.search(/[[{]/);
  const parsed = JSON.parse(raw.slice(start));
  return (Array.isArray(parsed) ? parsed[0] : parsed)?.results ?? [];
}

function esc(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function loadCatalogue() {
  const keys = d1(
    "SELECT key FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' ORDER BY key",
  ).map((row) => String(row.key));
  const numbered = keys
    .filter((key) => /^store:products#\d+$/.test(key))
    .sort((a, b) => Number(a.split("#")[1]) - Number(b.split("#")[1]));
  let raw = "";
  for (const key of numbered.length ? numbered : ["store:products"]) {
    raw += d1(`SELECT value FROM store_kv WHERE key = ${esc(key)}`)?.[0]?.value ?? "";
  }
  const live = new Map(
    JSON.parse(raw || "[]")
      .filter((doc) => doc?.id)
      .map((doc) => [String(doc.id), doc]),
  );
  for (const id of ids) {
    const row = d1(`SELECT value FROM store_kv WHERE key = ${esc(`store:product:${id}`)}`)?.[0];
    if (!row) continue;
    const doc = JSON.parse(row.value);
    if (doc?._deleted) live.delete(id);
    else if (doc?.id) live.set(String(doc.id), doc);
  }
  return live;
}

const MEDIA_ROLES = [
  "image",
  "imageUrl",
  "cartridgeImage",
  "nintendoCardImage",
  "coverImage",
  "coverHiResImage",
  "bannerImage",
  "bannerImages",
  "galleryImages",
];

function entries(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? item.url || item.imageUrl || item.src
          : "",
    )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function publicUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://banan.to${value}`;
  return "";
}

function expectedShape(role, ratio) {
  if (!Number.isFinite(ratio)) return "unknown";
  if (role === "cartridgeImage") return ratio < 0.9 ? "role-ok" : "wrong-role";
  if (role === "nintendoCardImage") return ratio >= 0.8 && ratio <= 1.2 ? "role-ok" : "wrong-role";
  if (["coverImage", "bannerImage", "bannerImages", "galleryImages"].includes(role)) {
    return ratio > 1.15 ? "role-ok" : "wrong-role";
  }
  if (role === "coverHiResImage") return ratio > 1.1 ? "role-ok" : "wrong-role";
  return "unclassified";
}

async function captureMedia(doc) {
  const rows = [];
  const productDir = path.join(OUT, "media", String(doc.id));
  mkdirSync(productDir, { recursive: true });
  for (const role of MEDIA_ROLES) {
    const urls = entries(doc[role]);
    for (let index = 0; index < urls.length; index++) {
      const source = urls[index];
      const url = publicUrl(source);
      const row = { role, index, source, fetch: url ? "pending" : "not-public-url" };
      rows.push(row);
      if (!url) continue;
      try {
        const res = await fetch(url, {
          redirect: "follow",
          headers: { "user-agent": "bananto-catalogue-review" },
          signal: AbortSignal.timeout(25_000),
        });
        row.http = res.status;
        if (!res.ok) {
          row.fetch = "failed";
          continue;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const metadata = await sharp(buffer).metadata();
        row.fetch = "ok";
        row.bytes = buffer.length;
        row.width = metadata.width;
        row.height = metadata.height;
        const ratio = metadata.width && metadata.height ? metadata.width / metadata.height : NaN;
        row.ratio = Number.isFinite(ratio) ? Number(ratio.toFixed(3)) : null;
        row.shape = expectedShape(role, ratio);
        const extension = metadata.format === "jpeg" ? "jpg" : metadata.format || "bin";
        const filename = `${role}-${String(index + 1).padStart(2, "0")}.${extension}`;
        writeFileSync(path.join(productDir, filename), buffer);
        row.artifact = `media/${doc.id}/${filename}`;
      } catch (error) {
        row.fetch = "failed";
        row.error = String(error?.message || error).slice(0, 160);
      }
    }
  }
  return rows;
}

mkdirSync(path.join(OUT, "products"), { recursive: true });
const catalogue = loadCatalogue();
const report = { generatedAt: new Date().toISOString(), readOnly: true, products: [] };
for (const id of ids) {
  const doc = catalogue.get(id);
  if (!doc) throw new Error(`Product not found: ${id}`);
  writeFileSync(path.join(OUT, "products", `${id}.json`), JSON.stringify(doc, null, 2) + "\n");
  report.products.push({
    id,
    title: doc.title,
    slug: doc.slug,
    keyCount: Object.keys(doc).length,
    media: await captureMedia(doc),
  });
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");

const lines = ["# Catalogue review batch (read-only)", "", `Generated ${report.generatedAt}.`, ""];
for (const product of report.products) {
  lines.push(
    `## ${product.title}`,
    "",
    `- \`${product.id}\` · \`${product.slug}\` · ${product.keyCount} fields`,
  );
  for (const media of product.media) {
    lines.push(
      `- ${media.role}[${media.index}]: ${media.fetch}${media.width ? ` · ${media.width}×${media.height} · ${media.shape}` : ""} · \`${media.source}\``,
    );
  }
  lines.push("");
}
writeFileSync(path.join(OUT, "report.md"), lines.join("\n") + "\n");
console.log(`Wrote read-only evidence for ${report.products.length} products to ${OUT}/`);
