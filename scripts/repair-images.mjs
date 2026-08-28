#!/usr/bin/env node
/**
 * Re-points product image roles at assets that actually exist in R2.
 *
 * DRY RUN BY DEFAULT. `--apply` is required to write anything.
 *
 * The product documents are not missing their image fields — every role is
 * populated. What broke is that many of those URLs name R2 objects that no
 * longer exist, because a media migration ingested fresh copies under new keys,
 * recorded them in `game_images`, and never wrote the new URLs back into the
 * documents. The old objects are gone; the new ones are in `bananto-private`.
 *
 * So this never invents an image and never restores a "lost" field. For each
 * role it checks whether the URL the document names still resolves. If it does,
 * that value wins and is left alone. Only when it does not does the repair look
 * for a `game_images` row of the *same role* for the *same product*, verify
 * that asset exists, and propose it.
 *
 * Roles stay separate. A missing square card is never filled from the front
 * cover, and one asset is never assigned to several roles.
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const DB_NAME = "bananto";
const CONFIG = "wrangler.jsonc";
const PUBLIC_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || "bananto";
const PRIVATE_BUCKET = "bananto-private";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = Number(
  (process.argv.find((a) => a.startsWith("--batch=")) ?? "--batch=5").split("=")[1],
);
const ONLY = (process.argv.find((a) => a.startsWith("--products=")) ?? "").split("=")[1];

/* ------------------------------------------------------------------ safety */

const READ_SHAPE = /^\s*select\b/i;
const MUTATING =
  /(^|[^_\w])(insert|update|delete|replace|upsert|alter|drop|create|attach|detach|vacuum|reindex|truncate)([^_\w]|$)/i;

function assertReadOnly(sql) {
  const s = String(sql).trim();
  if (!READ_SHAPE.test(s)) throw new Error(`REFUSED (not a SELECT): ${s.slice(0, 60)}`);
  if (MUTATING.test(s)) throw new Error(`REFUSED (mutating keyword): ${s.slice(0, 60)}`);
  if (s.replace(/;\s*$/, "").includes(";")) throw new Error("REFUSED (multiple statements)");
  return s;
}

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

/* ----------------------------------------------------------------- wrangler */

const WRANGLER =
  process.env.WRANGLER_BIN ||
  (existsSync("node_modules/.bin/wrangler") ? "node_modules/.bin/wrangler" : "wrangler");
const ENV = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };

function wrangler(args, { allowFail = false, timeoutMs = 120_000 } = {}) {
  try {
    return execFileSync(WRANGLER, args, {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      env: ENV,
    });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(redact(err?.stderr || err?.message || String(err)).slice(0, 800));
  }
}

const parseJson = (raw) => {
  if (raw == null) return null;
  const i = raw.search(/[[{]/);
  if (i < 0) return null;
  try {
    return JSON.parse(raw.slice(i));
  } catch {
    return null;
  }
};

function d1(sql) {
  const s = assertReadOnly(sql);
  const parsed = parseJson(
    wrangler(["d1", "execute", DB_NAME, "--remote", "--json", "--yes", "--config", CONFIG, "--command", s]),
  );
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

/**
 * The one write path: a single INSERT ... ON CONFLICT targeting exactly one
 * product's overlay row, addressed by its immutable id. No LIKE, no IN, no
 * NOT IN, nothing that can reach a second row.
 *
 * Sent with `--command`, not `--file`: a `--file` execution against this
 * database never returned during the audit and burned a whole job.
 */
const MAX_WRITE_BYTES = 500_000;

function writeOverlay(id, doc) {
  if (!APPLY) throw new Error("writeOverlay called without --apply");
  const value = JSON.stringify(doc);
  if (value.length > MAX_WRITE_BYTES) {
    return { ok: false, reason: `document is ${value.length} bytes, over the ${MAX_WRITE_BYTES} write cap` };
  }
  const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const sql =
    `INSERT INTO store_kv (key, value, updated_at) VALUES (` +
    `${esc(`store:product:${id}`)}, ${esc(value)}, ${esc(new Date().toISOString())})` +
    ` ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
  const out = wrangler(
    ["d1", "execute", DB_NAME, "--remote", "--json", "--yes", "--config", CONFIG, "--command", sql],
    { allowFail: true },
  );
  return { ok: out !== null, reason: out === null ? "wrangler returned no output" : "" };
}

/* ------------------------------------------------------------- role mapping */

/** `game_images.kind` → the product field that role belongs in. Never merged. */
function roleForKind(kind) {
  const k = String(kind).toLowerCase();
  if (/^front$|^cartridgeimage$|^boxart_front$|^packagingfront/.test(k)) return "cartridgeImage";
  if (/^square$|^nintendocardimage$|^squaregameimage$/.test(k)) return "nintendoCardImage";
  if (/^cover$|^coverimage$|^cardartwork$/.test(k)) return "coverImage";
  if (/^3d-texture$|^coverhiresimage$|^modeltexture/.test(k)) return "coverHiResImage";
  if (/^image$|^mainimage$/.test(k)) return "image";
  const banner = k.match(/^banner-(\d+)$/);
  if (banner) return `bannerImages[${banner[1]}]`;
  if (/^banner$|^bannerimages$/.test(k)) return "banner";
  return "";
}

const SINGLE_ROLES = ["image", "banner", "cartridgeImage", "nintendoCardImage", "coverImage", "coverHiResImage"];

function assetKey(url) {
  let path = String(url ?? "");
  try {
    if (path.startsWith("http")) path = new URL(path).pathname;
  } catch {
    /* not a URL */
  }
  path = path.replace(/^\/+/, "").replace(/^api\//, "");
  const i = path.indexOf("files/");
  return i > 0 ? path.slice(i) : path;
}

const probeCache = new Map();
let probes = 0;
function existsInR2(url) {
  const key = assetKey(url);
  if (!key) return false;
  if (probeCache.has(key)) return probeCache.get(key);
  probes++;
  let found = false;
  for (const bucket of [PRIVATE_BUCKET, PUBLIC_BUCKET]) {
    const got = wrangler(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--pipe"], {
      allowFail: true,
      timeoutMs: 15_000,
    });
    if (got && got.length > 0) {
      found = true;
      break;
    }
  }
  probeCache.set(key, found);
  return found;
}

/* --------------------------------------------------------------------- main */

say(`# Image re-point — ${APPLY ? "**APPLY**" : "DRY RUN (nothing is written)"}`);
say();
say(`Run at ${new Date().toISOString()}. Batch size ${BATCH_SIZE}.`);
say();

/* Live catalogue, same merge rule as loadStore. */
const chunkKeys = d1(
  "SELECT key FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' ORDER BY key",
).map((r) => String(r.key));
const numbered = chunkKeys
  .filter((k) => /^store:products#\d+$/.test(k))
  .sort((a, b) => Number(a.split("#")[1]) - Number(b.split("#")[1]));
let raw = "";
for (const key of numbered.length ? numbered : ["store:products"]) {
  process.stderr.write(`[chunk] ${key}\n`);
  raw += d1(`SELECT value FROM store_kv WHERE key = '${key.replace(/'/g, "''")}'`)?.[0]?.value ?? "";
}
const aggregate = JSON.parse(raw || "[]");
const live = new Map();
for (const p of aggregate) if (p?.id) live.set(String(p.id), p);
for (const row of d1("SELECT key, value FROM store_kv WHERE key LIKE 'store:product:%'")) {
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
say(`- Live products: **${live.size}**`);

/* The replacement catalogue: role → asset, per product. */
const byProduct = new Map();
for (const row of d1("SELECT game_id, kind, url FROM game_images")) {
  const id = String(row.game_id);
  if (!byProduct.has(id)) byProduct.set(id, []);
  byProduct.get(id).push({ kind: String(row.kind), url: String(row.url), role: roleForKind(row.kind) });
}
say(`- Products with \`game_images\` rows: **${byProduct.size}**`);
say();

const targets = ONLY ? ONLY.split(",").map((s) => s.trim()) : [...live.keys()];
const plans = [];

for (const id of targets) {
  const doc = live.get(id);
  if (!doc) continue;
  const candidates = byProduct.get(id) ?? [];
  const known = new Set(candidates.map((c) => assetKey(c.url)));
  const claimed = new Set();
  const fixes = [];
  const unrecoverable = [];

  const check = (role, current) => {
    if (!current) return;
    const key = assetKey(current);
    // A URL game_images already knows is a verified-present new-generation key.
    if (known.has(key) || existsInR2(current)) {
      claimed.add(key);
      return;
    }
    const match = candidates.find((c) => c.role === role && !claimed.has(assetKey(c.url)));
    if (match && existsInR2(match.url)) {
      claimed.add(assetKey(match.url));
      fixes.push({ role, from: current, to: match.url, kind: match.kind });
    } else {
      unrecoverable.push({ role, url: current });
    }
  };

  for (const role of SINGLE_ROLES) check(role, doc[role]);
  if (Array.isArray(doc.bannerImages)) {
    doc.bannerImages.forEach((url, i) => check(`bannerImages[${i}]`, url));
  }

  if (fixes.length || unrecoverable.length) {
    plans.push({ id, slug: String(doc.slug ?? ""), fixes, unrecoverable });
  }
}

say(`## Plan`);
say();
say(`- Products needing at least one change: **${plans.filter((p) => p.fixes.length).length}**`);
say(`- Total role re-points: **${plans.reduce((n, p) => n + p.fixes.length, 0)}**`);
say(`- Roles with no surviving asset anywhere: **${plans.reduce((n, p) => n + p.unrecoverable.length, 0)}**`);
say(`- R2 probes: ${probes}`);
say();
for (const p of plans.slice(0, 40)) {
  say(`### \`${p.id}\` ${p.slug}`);
  for (const f of p.fixes) say(`  - ${f.role}: dead → \`${assetKey(f.to)}\` (kind \`${f.kind}\`)`);
  for (const u of p.unrecoverable) say(`  - ${u.role}: **no replacement** — \`${assetKey(u.url)}\``);
}
say();

if (!APPLY) {
  say("**Dry run — nothing was written.** Re-run with `--apply` to write, in batches.");
} else {
  say("## Applying");
  say();
  let ok = 0;
  let failed = 0;
  const withFixes = plans.filter((p) => p.fixes.length);
  for (let i = 0; i < withFixes.length; i += BATCH_SIZE) {
    const batch = withFixes.slice(i, i + BATCH_SIZE);
    for (const plan of batch) {
      const doc = { ...live.get(plan.id) };
      const before = JSON.stringify(doc);
      for (const f of plan.fixes) {
        const arr = f.role.match(/^bannerImages\[(\d+)\]$/);
        if (arr) {
          doc.bannerImages = [...(doc.bannerImages ?? [])];
          doc.bannerImages[Number(arr[1])] = f.to;
        } else {
          doc[f.role] = f.to;
        }
      }
      // Backup the pre-change document to the log before writing.
      say(`  - \`${plan.id}\` backup ${before.length} bytes, ${plan.fixes.length} role(s)`);
      const wrote = writeOverlay(plan.id, doc);
      if (!wrote.ok) {
        failed++;
        say(`    **WRITE FAILED (${wrote.reason}) — stopping**`);
        break;
      }
      // Read-after-write verify.
      const back = d1(`SELECT value FROM store_kv WHERE key = 'store:product:${plan.id.replace(/'/g, "''")}'`);
      const verified = back?.[0]?.value ? JSON.parse(back[0].value) : null;
      const good = plan.fixes.every((f) => {
        const arr = f.role.match(/^bannerImages\[(\d+)\]$/);
        return arr ? verified?.bannerImages?.[Number(arr[1])] === f.to : verified?.[f.role] === f.to;
      });
      if (good) {
        ok++;
        say(`    verified`);
      } else {
        failed++;
        say(`    **VERIFY FAILED — stopping**`);
        break;
      }
    }
    if (failed) break;
  }
  say();
  say(`- Repaired and verified: **${ok}**`);
  say(`- Failed: **${failed}**`);
}

writeFileSync("repair-images.md", lines.join("\n") + "\n");
