#!/usr/bin/env node
/**
 * Read-only production diagnosis for the product data-loss incident.
 *
 * This script NEVER writes. Every SQL statement passes an allowlist that
 * accepts only SELECT/PRAGMA and rejects anything containing a mutating
 * keyword or a second statement, so a typo cannot become a migration. R2 is
 * touched with `bucket info` and `object get` only — no put, no delete, no
 * list-and-prune.
 *
 * It shells out to wrangler using CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
 * from the environment. Secret values are never printed: everything on its way
 * to stdout goes through redact().
 *
 *   node scripts/incident-readonly-report.mjs [--products prd_a,prd_b]
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const DB_NAME = "bananto";
const CONFIG = "wrangler.jsonc";
// The bucket the incident concerns. The secret wins when it is set, so the
// workflow stays correct if production ever points somewhere else.
const PUBLIC_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || "bananto";
const PRIVATE_BUCKET = "bananto-private";

/* ------------------------------------------------------------------ safety */

const READ_SHAPE = /^\s*select\b/i;
const MUTATING =
  /(^|[^_\w])(insert|update|delete|replace|upsert|alter|drop|create|attach|detach|vacuum|reindex|begin|commit|rollback|truncate)([^_\w]|$)/i;

function assertReadOnly(sql) {
  const s = String(sql).trim();
  if (!READ_SHAPE.test(s)) throw new Error(`REFUSED (not a SELECT): ${s.slice(0, 60)}`);
  if (MUTATING.test(s)) throw new Error(`REFUSED (mutating keyword): ${s.slice(0, 60)}`);
  if (s.replace(/;\s*$/, "").includes(";")) throw new Error("REFUSED (multiple statements)");
  return s;
}

/** Anything that could identify the account or the database never reaches stdout. */
const SECRETS = [
  process.env.CLOUDFLARE_API_TOKEN,
  process.env.CLOUDFLARE_ACCOUNT_ID,
  process.env.CLOUDFLARE_D1_DATABASE_ID,
].filter((v) => v && v.length >= 8);

function redact(text) {
  let out = String(text ?? "");
  for (const secret of SECRETS) out = out.split(secret).join("«redacted»");
  // Belt and braces: any bare 32-hex account id, any uuid-shaped database id.
  out = out.replace(/\b[0-9a-f]{32}\b/gi, "«redacted-id»");
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "«redacted-id»");
  return out;
}

const lines = [];
function say(text = "") {
  const safe = redact(text);
  lines.push(safe);
  console.log(safe);
}

/* ----------------------------------------------------------------- wrangler */

const WRANGLER =
  process.env.WRANGLER_BIN ||
  (existsSync("node_modules/.bin/wrangler") ? "node_modules/.bin/wrangler" : "wrangler");

function wrangler(args, { allowFail = false } = {}) {
  try {
    return execFileSync(WRANGLER, [...args], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch (err) {
    if (allowFail) return null;
    const detail = redact(err?.stderr || err?.stdout || err?.message || String(err));
    throw new Error(detail.slice(0, 1200));
  }
}

/** Wrangler prints warnings before the JSON body; take from the first bracket. */
function parseJson(raw) {
  if (raw == null) return null;
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

let queryCount = 0;
function d1(sql, { allowFail = false } = {}) {
  const statement = assertReadOnly(sql);
  queryCount++;
  const raw = wrangler(
    ["d1", "execute", DB_NAME, "--remote", "--json", "--yes", "--config", CONFIG, "--command", statement],
    { allowFail },
  );
  const parsed = parseJson(raw);
  if (!parsed) {
    if (allowFail) return null;
    throw new Error(`unparseable D1 response for: ${statement.slice(0, 80)}`);
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

/* ------------------------------------------------------------------ helpers */

const n = (value) => (value == null ? 0 : Number(value));
const kb = (bytes) => `${(n(bytes) / 1024).toFixed(1)} KB`;
const mb = (bytes) => `${(n(bytes) / 1024 / 1024).toFixed(2)} MB`;

function table(rows, columns) {
  if (!rows.length) return ["_(no rows)_"];
  const out = [`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`];
  for (const row of rows) out.push(`| ${columns.map((c) => String(row[c] ?? "")).join(" | ")} |`);
  return out;
}

/* --------------------------------------------------------------------- main */

const argProducts = (() => {
  const i = process.argv.indexOf("--products");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
})();

say("# Read-only production diagnosis — product data-loss incident");
say();
say(`Run at ${new Date().toISOString()}. **No statement in this run mutates anything.**`);
say();

/* 1 — connectivity ---------------------------------------------------------- */

say("## 1. Connectivity");
say();
const ping = d1("SELECT 1 AS ok");
say(`- D1 reached: **${ping?.[0]?.ok === 1 ? "yes" : "no"}**`);
say(`- D1 database name (from \`wrangler.jsonc\`): **${DB_NAME}** (binding \`bananto\`, \`--remote\`)`);
const configuredId = (readFileSync(CONFIG, "utf8").match(/"database_id"\s*:\s*"([^"]+)"/) ?? [])[1] ?? "";
if (process.env.CLOUDFLARE_D1_DATABASE_ID) {
  say(`- Database id in \`wrangler.jsonc\` matches the \`CLOUDFLARE_D1_DATABASE_ID\` secret: **${
    configuredId && configuredId === process.env.CLOUDFLARE_D1_DATABASE_ID ? "yes" : "NO — the run used the id in wrangler.jsonc"
  }** (values withheld)`);
}
const tables = d1(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).map((r) => r.name);
say(`- Tables visible: **${tables.length}**`);
const expected = [
  "store_kv", "store_rev", "product_index", "game_images", "game_variants",
  "game_device_performance", "game_device_performance_modes", "game_catalog",
  "game_records", "product_identity", "game_aliases", "game_price_history", "game_import_logs",
];
const missing = expected.filter((t) => !tables.includes(t));
say(`- Expected incident tables missing: ${missing.length ? "**" + missing.join(", ") + "**" : "_none_"}`);
say();

/* 2 — store_kv census ------------------------------------------------------- */

say("## 2. `store_kv` census");
say();
const census = d1(`SELECT CASE
    WHEN key = 'store' THEN '1 base document'
    WHEN key = 'store:products' OR key LIKE 'store:products#%' THEN '2 products aggregate'
    WHEN key LIKE 'store:product:%' THEN '3 granular overlay'
    WHEN key LIKE 'store:%' THEN '4 other heavy section'
    ELSE '5 other' END AS kind,
  COUNT(*) AS rows, SUM(LENGTH(value)) AS bytes
  FROM store_kv GROUP BY 1 ORDER BY 1`);
for (const row of census) row.bytes_h = mb(row.bytes);
for (const line of table(census, ["kind", "rows", "bytes", "bytes_h"])) say(line);
say();
const totalBytes = census.reduce((sum, r) => sum + n(r.bytes), 0);
say(`**Total \`store_kv\` bytes: ${totalBytes.toLocaleString()} (${mb(totalBytes)})**`);
say();

say("### Aggregate chunks");
say();
const chunks = d1(
  `SELECT key, LENGTH(value) AS bytes FROM store_kv
   WHERE key = 'store:products' OR key LIKE 'store:products#%' ORDER BY key`,
);
for (const row of chunks) row.bytes_h = kb(row.bytes);
for (const line of table(chunks, ["key", "bytes", "bytes_h"])) say(line);
const aggregateBytes = chunks.reduce((sum, r) => sum + n(r.bytes), 0);
say();
say(`**Aggregate bytes: ${aggregateBytes.toLocaleString()} (${mb(aggregateBytes)})**`);
say();

/* 3 — granular overlays ----------------------------------------------------- */

say("## 3. Granular overlays");
say();
const overlay = d1(`SELECT COUNT(*) AS overlays,
    SUM(CASE WHEN value LIKE '%"_deleted":true%' THEN 1 ELSE 0 END) AS compaction_pattern_hits,
    SUM(CASE WHEN LENGTH(value) < 400 THEN 1 ELSE 0 END) AS under_400_bytes,
    SUM(LENGTH(value)) AS bytes
  FROM store_kv WHERE key LIKE 'store:product:%'`)[0] ?? {};
say(`- Surviving granular overlays: **${n(overlay.overlays)}**`);
say(`- Rows matching the compaction \`LIKE '%"_deleted":true%'\` pattern: **${n(overlay.compaction_pattern_hits)}**`);
say(`- Overlays under 400 bytes (tombstone-sized): **${n(overlay.under_400_bytes)}**`);
say(`- Overlay bytes: ${n(overlay.bytes).toLocaleString()} (${mb(overlay.bytes)})`);
say();
say("### Thinnest overlays");
say();
const thin = d1(
  `SELECT key, LENGTH(value) AS bytes FROM store_kv WHERE key LIKE 'store:product:%'
   ORDER BY LENGTH(value) ASC LIMIT 20`,
);
for (const line of table(thin, ["key", "bytes"])) say(line);
say();

/* 4 — product_index --------------------------------------------------------- */

say("## 4. `product_index`");
say();
const pi = d1(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN image = '' OR image IS NULL THEN 1 ELSE 0 END) AS without_image,
    SUM(CASE WHEN hidden = 1 THEN 1 ELSE 0 END) AS hidden,
    SUM(CASE WHEN performance_required = 1 THEN 1 ELSE 0 END) AS performance_required
  FROM product_index`, { allowFail: true });
if (pi) {
  const row = pi[0] ?? {};
  say(`- Products indexed: **${n(row.total)}**`);
  say(`- Indexed rows with no image: **${n(row.without_image)}**`);
  say(`- Hidden: ${n(row.hidden)} — flagged performance-required: ${n(row.performance_required)}`);
} else {
  say("- `product_index` unreadable or absent.");
}
say();

/* 5 — relation tables ------------------------------------------------------- */

say("## 5. Product relation tables");
say();
const relations = [
  ["game_images", "game_id"],
  ["game_variants", "game_id"],
  ["game_device_performance", "game_id"],
  ["game_device_performance_modes", "performance_id"],
  ["game_records", "game_id"],
  ["game_aliases", "game_id"],
  ["game_price_history", "game_id"],
  ["game_import_logs", "game_id"],
  ["product_identity", "product_id"],
  ["game_catalog", "title"],
];
const relationRows = [];
for (const [name, key] of relations) {
  if (!tables.includes(name)) {
    relationRows.push({ table: name, rows: "—", distinct_parents: "table absent" });
    continue;
  }
  const r = d1(`SELECT COUNT(*) AS rows, COUNT(DISTINCT ${key}) AS parents FROM ${name}`, {
    allowFail: true,
  });
  relationRows.push({
    table: name,
    rows: r ? n(r[0]?.rows) : "error",
    distinct_parents: r ? n(r[0]?.parents) : "error",
  });
}
for (const line of table(relationRows, ["table", "rows", "distinct_parents"])) say(line);
say();

if (tables.includes("game_images")) {
  say("### `game_images` by role (`kind`)");
  say();
  const kinds = d1(
    "SELECT kind, COUNT(*) AS rows, COUNT(DISTINCT game_id) AS products FROM game_images GROUP BY kind ORDER BY rows DESC LIMIT 30",
  );
  for (const line of table(kinds, ["kind", "rows", "products"])) say(line);
  say();
}

/* 6 — reconstruct the catalogue exactly as loadStore does ------------------- */

say("## 6. Catalogue reconstruction (same merge rule as `loadStore`)");
say();

const chunkKeys = chunks.map((c) => c.key);
let aggregateRaw = "";
const singleKey = chunkKeys.find((k) => k === "store:products");
const numbered = chunkKeys
  .filter((k) => /^store:products#\d+$/.test(k))
  .sort((a, b) => Number(a.split("#")[1]) - Number(b.split("#")[1]));

if (numbered.length) {
  for (const key of numbered) {
    const row = d1(`SELECT value FROM store_kv WHERE key = '${key.replace(/'/g, "''")}'`);
    aggregateRaw += row?.[0]?.value ?? "";
  }
} else if (singleKey) {
  const row = d1("SELECT value FROM store_kv WHERE key = 'store:products'");
  aggregateRaw = row?.[0]?.value ?? "";
}

let aggregateProducts = [];
let aggregateParseError = "";
try {
  const parsed = JSON.parse(aggregateRaw || "[]");
  aggregateProducts = Array.isArray(parsed) ? parsed : [];
} catch (err) {
  aggregateParseError = err.message;
}
say(`- Aggregate parsed: **${aggregateParseError ? "FAILED — " + aggregateParseError : "ok"}**`);
say(`- Products in the aggregate: **${aggregateProducts.length}**`);

const overlayRows = d1(
  "SELECT key, value FROM store_kv WHERE key LIKE 'store:product:%' ORDER BY key",
);
const overlays = new Map();
let tombstones = 0;
for (const row of overlayRows) {
  let doc = null;
  try {
    doc = JSON.parse(row.value);
  } catch {
    continue;
  }
  if (!doc?.id) continue;
  if (doc._deleted === true) tombstones++;
  overlays.set(String(doc.id), doc);
}
say(`- Parsed overlays: **${overlays.size}** (top-level tombstones: **${tombstones}**)`);

const live = new Map();
for (const p of aggregateProducts) {
  if (p?.id) live.set(String(p.id), { doc: p, source: "aggregate" });
}
for (const [id, doc] of overlays) {
  if (doc._deleted === true) live.delete(id);
  else live.set(id, { doc, source: "overlay" });
}
say(`- **Live products after the merge: ${live.size}**`);
say();

/* 7 — richness profile ------------------------------------------------------ */

const RICH_KEYS = [
  "images", "gallery", "banner", "trailer", "nintendo", "switch2", "overview",
  "gameplayPillars", "story", "editionOptions", "editions", "dlcs", "genres",
  "supportedLanguages", "gameTypes", "features", "performance", "devicePerformance",
];
const PROJECTION_KEYS = new Set([
  "id", "slug", "title", "titleEn", "category", "categoryId", "kind", "schemaId",
  "platform", "price", "cost", "stock", "isInfiniteStock", "isHidden", "status",
  "sales", "image", "displayOrder", "updatedAt", "createdAt", "releaseDate",
]);

function sizeOf(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  return 1;
}

function profile(id, entry) {
  const doc = entry.doc;
  const keys = Object.keys(doc);
  const rich = {};
  for (const key of RICH_KEYS) rich[key] = sizeOf(doc[key]);
  const richTotal = Object.values(rich).reduce((a, b) => a + b, 0);
  const imagesObj = doc.images && typeof doc.images === "object" ? doc.images : {};
  return {
    id,
    source: entry.source,
    bytes: JSON.stringify(doc).length,
    keys: keys.length,
    // The Vector-B fingerprint: nothing survives beyond the projection columns.
    projectionOnly: keys.every((k) => PROJECTION_KEYS.has(k)),
    beyondProjection: keys.filter((k) => !PROJECTION_KEYS.has(k)).length,
    richTotal,
    rich,
    imageRoles: {
      image: doc.image ? 1 : 0,
      banner: doc.banner ? 1 : 0,
      gallery: Array.isArray(doc.gallery) ? doc.gallery.length : 0,
      cartridgeFront: imagesObj.cartridgeFront ? 1 : 0,
      boxArt: imagesObj.boxArt ? 1 : 0,
      screenshots: Array.isArray(imagesObj.screenshots) ? imagesObj.screenshots.length : 0,
    },
  };
}

const profiles = [];
for (const [id, entry] of live) profiles.push(profile(id, entry));

say("## 7. Richness profile across the live catalogue");
say();
const projectionOnly = profiles.filter((p) => p.projectionOnly);
const noRich = profiles.filter((p) => p.richTotal === 0);
const noImages = profiles.filter(
  (p) => p.imageRoles.image + p.imageRoles.banner + p.imageRoles.gallery +
         p.imageRoles.cartridgeFront + p.imageRoles.boxArt + p.imageRoles.screenshots === 0,
);
say(`- Live products: **${profiles.length}**`);
say(`- Carrying **only** \`product_index\` projection keys (Vector B fingerprint): **${projectionOnly.length}**`);
say(`- Carrying no rich field at all (${RICH_KEYS.length} probed keys all empty): **${noRich.length}**`);
say(`- Carrying no image in any role: **${noImages.length}**`);
say(`- Median document size: ${(() => {
  const sizes = profiles.map((p) => p.bytes).sort((a, b) => a - b);
  return sizes.length ? sizes[Math.floor(sizes.length / 2)].toLocaleString() + " bytes" : "n/a";
})()}`);
say();

/* 8 — relations that outlive the document --------------------------------- */

say("## 8. Products whose relations survived but whose document did not");
say();
const imagesByProduct = new Map();
if (tables.includes("game_images")) {
  for (const row of d1("SELECT game_id, COUNT(*) AS rows FROM game_images GROUP BY game_id")) {
    imagesByProduct.set(String(row.game_id), n(row.rows));
  }
}
const variantsByProduct = new Map();
if (tables.includes("game_variants")) {
  for (const row of d1("SELECT game_id, COUNT(*) AS rows FROM game_variants GROUP BY game_id")) {
    variantsByProduct.set(String(row.game_id), n(row.rows));
  }
}
const perfByProduct = new Map();
if (tables.includes("game_device_performance")) {
  for (const row of d1(
    "SELECT game_id, COUNT(*) AS rows FROM game_device_performance WHERE active = 1 GROUP BY game_id",
  )) {
    perfByProduct.set(String(row.game_id), n(row.rows));
  }
}

const damaged = [];
for (const p of profiles) {
  const relImages = imagesByProduct.get(p.id) ?? 0;
  const relVariants = variantsByProduct.get(p.id) ?? 0;
  const relPerf = perfByProduct.get(p.id) ?? 0;
  const docImages =
    p.imageRoles.image + p.imageRoles.banner + p.imageRoles.gallery +
    p.imageRoles.cartridgeFront + p.imageRoles.boxArt + p.imageRoles.screenshots;
  const deficit =
    Math.max(0, relImages - docImages) +
    Math.max(0, relVariants - p.rich.editions - p.rich.editionOptions) +
    Math.max(0, relPerf - p.rich.performance - p.rich.devicePerformance);
  if (deficit > 0 || (relImages > 0 && docImages === 0)) {
    damaged.push({ ...p, relImages, relVariants, relPerf, docImages, deficit });
  }
}
damaged.sort((a, b) => b.deficit - a.deficit);
say(`- Products with relation rows the document no longer reflects: **${damaged.length}**`);
say(`- Of those, with relation images but **zero** images in the document: **${damaged.filter((d) => d.relImages > 0 && d.docImages === 0).length}**`);
say();
for (const line of table(
  damaged.slice(0, 25).map((d) => ({
    id: d.id, source: d.source, bytes: d.bytes, keys: d.keys,
    doc_images: d.docImages, rel_images: d.relImages,
    rel_variants: d.relVariants, rel_perf: d.relPerf, deficit: d.deficit,
  })),
  ["id", "source", "bytes", "keys", "doc_images", "rel_images", "rel_variants", "rel_perf", "deficit"],
)) say(line);
say();

/* 9 — deep dive on individual products ------------------------------------- */

say("## 9. Damaged products in detail");
say();
const sample = argProducts.length
  ? argProducts
  : damaged.slice(0, 3).map((d) => d.id);
if (!sample.length) {
  say("_No product met the damage heuristic; nothing to dissect._");
}
const sampleUrls = [];
for (const id of sample) {
  const entry = live.get(id);
  say(`### \`${id}\``);
  say();
  if (!entry) {
    say("- Not present in the live catalogue (deleted or never existed).");
    const tomb = overlays.get(id);
    say(`- Overlay row: ${tomb ? (tomb._deleted ? "tombstone" : "live overlay") : "none"}`);
    say();
    continue;
  }
  const p = profile(id, entry);
  say(`- Title: \`${String(entry.doc.title ?? "").slice(0, 60)}\` — slug \`${String(entry.doc.slug ?? "")}\``);
  say(`- Source of the live copy: **${p.source}** — ${p.bytes.toLocaleString()} bytes, ${p.keys} top-level keys`);
  say(`- Keys beyond the projection column set: **${p.beyondProjection}** ${p.projectionOnly ? "(**projection-only — Vector B fingerprint**)" : ""}`);
  say(`- Image roles in the document: ${JSON.stringify(p.imageRoles)}`);
  say(`- Rich field sizes: ${JSON.stringify(p.rich)}`);
  say(`- Relation rows still in D1: images=${imagesByProduct.get(id) ?? 0}, variants=${variantsByProduct.get(id) ?? 0}, active performance=${perfByProduct.get(id) ?? 0}`);
  const overlayDoc = overlays.get(id);
  say(`- Overlay row present: ${overlayDoc ? (overlayDoc._deleted ? "**tombstone**" : "yes, live") : "**no** (aggregate is the only copy)"}`);
  if (tables.includes("game_images")) {
    const rows = d1(
      `SELECT kind, url, is_primary FROM game_images WHERE game_id = '${id.replace(/'/g, "''")}' ORDER BY kind LIMIT 12`,
    );
    for (const line of table(
      rows.map((r) => ({ kind: r.kind, is_primary: r.is_primary, url: String(r.url).slice(0, 90) })),
      ["kind", "is_primary", "url"],
    )) say(line);
    for (const r of rows) sampleUrls.push({ id, kind: r.kind, url: r.url });
  }
  say();
}

/* 10 — R2 ------------------------------------------------------------------- */

say("## 10. R2 (read/list only)");
say();
for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
  const raw = wrangler(["r2", "bucket", "info", bucket, "--json"], { allowFail: true });
  const info = parseJson(raw);
  if (!info) {
    say(`- \`${bucket}\`: **unreachable or no permission** (bucket info failed).`);
    continue;
  }
  const payload = info.result ?? info;
  say(`- \`${bucket}\`: reached. name=\`${payload.name ?? bucket}\`, objects=**${payload.objectCount ?? payload.object_count ?? "unknown"}**, size=${payload.payloadSize ?? payload.payload_size ?? "unknown"}`);
}
say();

say("### Do the assets of the sampled damaged products still exist?");
say();
const checked = [];
for (const { id, kind, url } of sampleUrls.slice(0, 12)) {
  let key = "";
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    key = path.replace(/^\/+/, "");
    const marker = key.indexOf("files/");
    if (marker > 0) key = key.slice(marker);
  } catch {
    key = "";
  }
  if (!key) {
    checked.push({ id, kind, key: "(not an R2 key)", present: "n/a" });
    continue;
  }
  const got = wrangler(["r2", "object", "get", `${PUBLIC_BUCKET}/${key}`, "--remote", "--pipe"], {
    allowFail: true,
  });
  checked.push({
    id: id.slice(0, 22),
    kind,
    key: key.length > 70 ? "…" + key.slice(-68) : key,
    present: got && got.length > 0 ? "YES" : "no",
  });
}
for (const line of table(checked, ["id", "kind", "key", "present"])) say(line);
say();

/* 11 — verdict -------------------------------------------------------------- */

say("## 11. Vector verdict (evidence only — no repair attempted)");
say();
say(`- **Vector A** (compaction \`DELETE … LIKE '%"_deleted":true%'\` removing live overlays): rows currently matching that pattern = **${n(overlay.compaction_pattern_hits)}**, of which top-level tombstones = **${tombstones}**. Live overlays matching the pattern = **${Math.max(0, n(overlay.compaction_pattern_hits) - tombstones)}**.`);
say(`- **Vector B** (projection row written back as a product): live products carrying only projection keys = **${projectionOnly.length}**.`);
say(`- **Vector C** (rich data intact, only the projection/storefront stale): products in the merge = ${live.size} vs \`product_index\` = ${pi ? n(pi[0]?.total) : "n/a"}; drift = **${pi ? live.size - n(pi[0]?.total) : "n/a"}**.`);
say(`- **Vector D** (empty-products document written back): aggregate holds **${aggregateProducts.length}** products — an empty aggregate would read 0.`);
say();
say(`_Queries executed: ${queryCount}, all read-only._`);

const report = lines.join("\n") + "\n";
writeFileSync("incident-report.md", report);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
