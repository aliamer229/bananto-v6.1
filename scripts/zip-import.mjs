#!/usr/bin/env node
/**
 * Applies the attached import templates to production.
 *
 * DRY RUN BY DEFAULT — `--apply` is required to write anything.
 *
 * Report B classified all 76 templates. This acts on that classification:
 * a template that matches an existing product updates it, a template that
 * matches nothing creates a product, and a template whose title exists only on
 * the other console is left for a person, because a Switch 1 and a Switch 2
 * edition are separate products in this catalogue and merging them would
 * destroy one of them.
 *
 * The matching is redone here rather than read from the report, so a product
 * created earlier in this same run is visible to every template after it. That
 * is the duplicate check that matters: two templates for the same game, or a
 * template for a game a previous batch already created.
 *
 * Nothing about the mapping is reimplemented. A new product is built by the
 * application's own batch import — hidden by default — and an update goes
 * through the same merge guard as the save endpoint, so an omitted field can
 * never erase a stored one.
 */

import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const TEMPLATE_DIR = "import-sources/nintendo-2026-08";
const WORK_DIR = "zip-import";

const APPLY = process.argv.includes("--apply");
const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const num = (name, fallback) => Number(flag(name, fallback));

const BATCH_SIZE = num("batch", 5);
const OFFSET = num("offset", 0);
const LIMIT = num("limit", 100);
const ACTIONS = flag("actions", "update,create")
  .split(",")
  .map((s) => s.trim().toUpperCase());
const ONLY_UPDATE = ACTIONS.includes("UPDATE") && !ACTIONS.includes("CREATE");
const ONLY_CREATE = ACTIONS.includes("CREATE") && !ACTIONS.includes("UPDATE");

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

/* ---------------------------------------------- the application's own code */

mkdirSync(WORK_DIR, { recursive: true });
const outfile = path.resolve(".zip-import-bundle.mjs");
await build({
  entryPoints: ["scripts/lib/import-entry.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  logLevel: "silent",
  alias: { "@": path.resolve("src") },
  external: ["cloudflare:workers", "node:async_hooks", "node:crypto", "sharp"],
});
const app = await import(outfile);

say(`# Template import — ${APPLY ? "**APPLY**" : "DRY RUN (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}. Batch ${BATCH_SIZE}, offset ${OFFSET}, limit ${LIMIT}, actions ${ACTIONS.join("+")}.`);
say();

/* ------------------------------------------------------------- the catalogue */

async function loadCatalogue() {
  const rows = await app.d1All(
    "SELECT key, value FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' OR key LIKE 'store:product:%'",
  );
  const chunks = rows
    .filter((r) => !String(r.key).startsWith("store:product:"))
    .sort((a, b) => {
      const n = (k) => (String(k).includes("#") ? Number(String(k).split("#")[1]) : -1);
      return n(a.key) - n(b.key);
    });
  let raw = "";
  for (const row of chunks) raw += String(row.value ?? "");
  const live = new Map();
  for (const p of JSON.parse(raw || "[]")) if (p?.id) live.set(String(p.id), p);
  for (const row of rows.filter((r) => String(r.key).startsWith("store:product:"))) {
    let doc = null;
    try {
      doc = JSON.parse(String(row.value));
    } catch {
      continue;
    }
    if (!doc?.id) continue;
    if (doc._deleted === true) live.delete(String(doc.id));
    else live.set(String(doc.id), doc);
  }
  return live;
}

const normalizeTitle = (t) =>
  String(t ?? "")
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normalizePlatform = (p) => {
  const s = String(p ?? "").toLowerCase();
  if (/switch\s*2|switch2/.test(s)) return "switch2";
  if (/switch/.test(s)) return "switch1";
  return s.trim() || "unknown";
};

/*
  `d1All`/`d1Run` return empty and do nothing when no database is reachable, so
  an unreachable D1 would look exactly like an empty catalogue and a run of
  successful no-op writes. Fail here instead.
*/
const reachable = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reachable.length) {
  throw new Error("D1 is not reachable — refusing to run against nothing");
}

const live = await loadCatalogue();
say(`- \`store_kv\` rows: **${reachable[0].n}** · live products before this run: **${live.size}**`);

/* Aliases point into the game-records tables, which are empty in production, so
   an alias only counts when the id it names is a product that exists. */
const aliasBy = new Map();
try {
  for (const row of await app.d1All("SELECT alias, game_id FROM game_aliases")) {
    aliasBy.set(normalizeTitle(row.alias), String(row.game_id));
  }
} catch {
  say(`- (no \`game_aliases\` table — alias matching skipped)`);
}

/** Rebuilt after every create so the next template sees what this run added. */
function indexCatalogue() {
  const bySlug = new Map();
  const byTitlePlatform = new Map();
  for (const [id, doc] of live) {
    if (doc.slug) bySlug.set(String(doc.slug).toLowerCase(), id);
    byTitlePlatform.set(`${normalizeTitle(doc.title ?? doc.name)}|${normalizePlatform(doc.platform)}`, id);
  }
  return { bySlug, byTitlePlatform };
}

function classify(data) {
  const { bySlug, byTitlePlatform } = indexCatalogue();
  const title = data.title || data.name || "";
  const platform = normalizePlatform(data.platform);
  const slug = String(data.slug ?? "").toLowerCase();
  const nt = normalizeTitle(title);

  if (slug && bySlug.has(slug)) return { action: "UPDATE_EXISTING", id: bySlug.get(slug), how: "slug" };
  if (byTitlePlatform.has(`${nt}|${platform}`)) {
    return { action: "UPDATE_EXISTING", id: byTitlePlatform.get(`${nt}|${platform}`), how: "title+platform" };
  }
  if (aliasBy.has(nt) && live.has(aliasBy.get(nt))) {
    return { action: "UPDATE_EXISTING", id: aliasBy.get(nt), how: "alias" };
  }
  const other = platform === "switch2" ? "switch1" : "switch2";
  if (byTitlePlatform.has(`${nt}|${other}`)) {
    return {
      action: "MANUAL_REVIEW",
      id: "",
      how: `same title on ${other} — separate edition`,
    };
  }
  return { action: "CREATE_NEW", id: "", how: "no match" };
}

/* ----------------------------------------------------------------- writing */

const nowIso = () => new Date().toISOString();

async function writeOverlay(id, doc) {
  if (!APPLY) throw new Error("writeOverlay without --apply");
  await app.d1Run(
    "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `store:product:${id}`,
    JSON.stringify(doc),
    nowIso(),
  );
}

async function readBack(id) {
  const rows = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${id}`);
  try {
    return rows?.[0]?.value ? JSON.parse(String(rows[0].value)) : null;
  } catch {
    return null;
  }
}

const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return Boolean(v.trim());
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return false;
};

/* -------------------------------------------------------------------- main */

const files = existsSync(TEMPLATE_DIR)
  ? readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".txt")).sort()
  : [];
say(`- Templates found: **${files.length}**`);
say();
if (!files.length) throw new Error(`no templates under ${TEMPLATE_DIR}`);

const totals = {
  updated: 0,
  created: 0,
  manualReview: 0,
  skippedByFilter: 0,
  unchanged: 0,
  parseFailed: 0,
  writeFailed: 0,
  fieldsAdded: 0,
  blocked: 0,
};
const rows = [];
const slice = files.slice(OFFSET, OFFSET + LIMIT);

for (let start = 0; start < slice.length; start += BATCH_SIZE) {
  const batch = slice.slice(start, start + BATCH_SIZE);
  say(`## Batch ${Math.floor(start / BATCH_SIZE) + 1} — ${batch.length} template(s)`);
  say();

  for (const file of batch) {
    const raw = readFileSync(path.join(TEMPLATE_DIR, file), "utf8");
    let parsed;
    try {
      parsed = app.parseGameImport(raw);
    } catch (err) {
      totals.parseFailed++;
      say(`- \`${file}\`: **parse failed** — ${String(err).slice(0, 120)}`);
      continue;
    }
    const blocking = parsed.errors.filter((e) => e.severity === "error");
    if (blocking.length) {
      totals.parseFailed++;
      say(`- \`${file}\`: **rejected by the parser** — ${blocking[0].key}: ${blocking[0].message}`);
      rows.push({ file, action: "PARSE_FAILED", reason: blocking[0].message });
      continue;
    }

    const verdict = classify(parsed.data);
    const title = parsed.data.title || parsed.data.name || file;

    if (verdict.action === "MANUAL_REVIEW") {
      totals.manualReview++;
      say(`- \`${file}\` **${title}** — MANUAL_REVIEW (${verdict.how}); nothing written.`);
      rows.push({ file, title, action: "MANUAL_REVIEW", reason: verdict.how });
      continue;
    }
    if (verdict.action === "UPDATE_EXISTING" && ONLY_CREATE) {
      totals.skippedByFilter++;
      continue;
    }
    if (verdict.action === "CREATE_NEW" && ONLY_UPDATE) {
      totals.skippedByFilter++;
      continue;
    }

    if (verdict.action === "UPDATE_EXISTING") {
      const stored = live.get(verdict.id);
      /*
        Production wins wherever it has an answer. The template is a source for
        what is missing, not a replacement for what is there — several of these
        products have been edited by hand since the templates were written.
      */
      const patch = {};
      for (const [field, value] of Object.entries(parsed.data)) {
        if (!filled(value)) continue;
        if (filled(stored[field])) continue;
        patch[field] = value;
      }
      const result = app.mergeProductUpdate(stored, patch);
      if (result.rejectedMedia.length) {
        totals.blocked += result.rejectedMedia.length;
        say(`  - ${app.oversizedMediaLog(verdict.id, result.rejectedMedia)}`);
      }
      if (result.blocked.length) {
        totals.blocked += result.blocked.length;
        say(`  - ${app.destructiveUpdateLog(verdict.id, result.blocked)}`);
      }
      if (!result.changed.length) {
        totals.unchanged++;
        say(`- \`${file}\` **${title}** → \`${verdict.id}\` (${verdict.how}): already complete, nothing to add.`);
        rows.push({ file, title, action: "UPDATE_EXISTING", id: verdict.id, added: [] });
        continue;
      }
      say(`- \`${file}\` **${title}** → \`${verdict.id}\` (${verdict.how}): ${result.changed.length} field(s) — ${result.changed.join(", ")}`);
      if (!APPLY) {
        rows.push({ file, title, action: "UPDATE_EXISTING", id: verdict.id, added: result.changed });
        continue;
      }
      writeFileSync(path.join(WORK_DIR, `${verdict.id}.before.json`), JSON.stringify(stored, null, 1));
      const merged = { ...result.merged, updatedAt: nowIso() };
      try {
        await writeOverlay(verdict.id, merged);
      } catch (err) {
        totals.writeFailed++;
        say(`  - **write failed** — ${String(err).slice(0, 160)}`);
        continue;
      }
      const back = await readBack(verdict.id);
      const missing = result.changed.filter((f) => !filled(back?.[f]));
      if (back && !missing.length) {
        totals.updated++;
        totals.fieldsAdded += result.changed.length;
        live.set(verdict.id, merged);
        say(`  - written and verified.`);
      } else {
        totals.writeFailed++;
        say(`  - **read-after-write verification failed** for: ${missing.join(", ") || "the whole row"}`);
      }
      rows.push({ file, title, action: "UPDATE_EXISTING", id: verdict.id, added: result.changed });
      continue;
    }

    /* CREATE_NEW — the application's own batch import, hidden by default. */
    const built = app.buildBatchGameImport(raw, "cat_nintendo");
    if (!built.ok) {
      totals.parseFailed++;
      say(`- \`${file}\` **${title}**: **cannot build a product** — ${built.reason}`);
      rows.push({ file, title, action: "CREATE_FAILED", reason: built.reason });
      continue;
    }
    const payload = { ...built.payload, isHidden: true, createdAt: nowIso(), updatedAt: nowIso() };
    if (live.has(String(payload.id))) {
      // A generated id that already exists would overwrite a real product.
      totals.writeFailed++;
      say(`- \`${file}\` **${title}**: **generated id \`${payload.id}\` is already taken** — skipped.`);
      continue;
    }
    say(`- \`${file}\` **${title}** → CREATE \`${payload.id}\` (${normalizePlatform(payload.platform)}, hidden)`);
    if (!APPLY) {
      // Visible to the next template's duplicate check even in a dry run.
      live.set(String(payload.id), payload);
      rows.push({ file, title, action: "CREATE_NEW", id: payload.id });
      continue;
    }
    try {
      await writeOverlay(payload.id, payload);
    } catch (err) {
      totals.writeFailed++;
      say(`  - **write failed** — ${String(err).slice(0, 160)}`);
      continue;
    }
    const back = await readBack(payload.id);
    if (back?.id === payload.id && back?.isHidden === true) {
      totals.created++;
      live.set(String(payload.id), payload);
      say(`  - created and verified, hidden.`);
    } else {
      totals.writeFailed++;
      say(`  - **read-after-write verification failed** — the product may not be stored.`);
    }
    rows.push({ file, title, action: "CREATE_NEW", id: payload.id });
  }
  say();
}

/* ---------------------------------------------------------------- summary */

say(`## Summary`);
say();
say(`| | |`);
say(`| --- | ---: |`);
say(`| Templates in this run | ${slice.length} |`);
say(`| Updated existing products | ${totals.updated} |`);
say(`| Created new products (hidden) | ${totals.created} |`);
say(`| Already complete, nothing to add | ${totals.unchanged} |`);
say(`| Left for manual review | ${totals.manualReview} |`);
say(`| Skipped by the action filter | ${totals.skippedByFilter} |`);
say(`| Rejected by the parser | ${totals.parseFailed} |`);
say(`| Fields added to existing products | ${totals.fieldsAdded} |`);
say(`| Values the guard refused | ${totals.blocked} |`);
say(`| Write or verification failures | ${totals.writeFailed} |`);
say(`| Live products after this run | ${live.size} |`);
say();

if (!APPLY) say(`**Dry run — nothing written.** Re-run with \`--apply\`.`);

writeFileSync("zip-import.md", lines.join("\n") + "\n");
writeFileSync(path.join(WORK_DIR, "run.json"), JSON.stringify({ totals, rows }, null, 1));
