#!/usr/bin/env node
/**
 * Gives a product the slug its own title implies, without breaking the old URL.
 *
 * INSPECTS BY DEFAULT. `--apply` is required to write.
 *
 * One document carries the slug `super-mario-bros-wonder-switch-2-edition-
 * bellabel-park` under the title "Super Mario Party Jamboree – Nintendo Switch 2
 * Edition + Jamboree TV". The slug was built from a different game's name, so
 * the storefront URL says one game and the page says another.
 *
 * A rename alone would turn every existing link into a 404, so the old slug is
 * kept as an alias pointing at the same product and is verified before the new
 * slug is written. Uniqueness is checked first: a slug that already belongs to
 * another product is refused rather than duplicated.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { slugifyTitle } from "./lib/nintendo-store.mjs";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const APPLY = process.argv.includes("--apply");
const OUT = flag("out", "reslug.md");
const TARGET = flag("product", "");
const WANTED = flag("slug", "");
if (!TARGET) throw new Error("--product is required (slug or id)");

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

process.env.D1_DATABASE_ID ||= process.env.CLOUDFLARE_D1_DATABASE_ID || "";
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "D1_DATABASE_ID"]) {
  if (!process.env[key]) throw new Error(`missing ${key}`);
}

const outfile = path.resolve(".reslug-bundle.mjs");
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

const reachable = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reachable.length) throw new Error("D1 is not reachable — refusing to report on nothing");

const rows = await app.d1All(
  "SELECT key, value FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%' OR key LIKE 'store:product:%'",
);
let aggregate = "";
const overlays = [];
for (const row of rows) {
  const key = String(row.key);
  if (key.startsWith("store:product:")) overlays.push(row);
  else aggregate += String(row.value ?? "");
}
const live = new Map();
for (const p of JSON.parse(aggregate || "[]")) if (p?.id) live.set(String(p.id), p);
for (const row of overlays) {
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

const bySlug = new Map();
for (const p of live.values()) if (p.slug) bySlug.set(String(p.slug), p);
const product = live.get(TARGET) ?? bySlug.get(TARGET) ?? null;

say(`# Slug correction — ${APPLY ? "**APPLY**" : "INSPECT ONLY (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
if (!product) throw new Error(`no live product for "${TARGET}"`);

const title = String(product.title || product.name || "");
const oldSlug = String(product.slug ?? "");
const newSlug = WANTED || slugifyTitle(title);

say(`- product: \`${product.id}\``);
say(`- title: **${title}**`);
say(`- slug now: \`${oldSlug}\``);
say(`- slug proposed: \`${newSlug}\`${WANTED ? " (given)" : " (derived from the title by the store's own `slugifyTitle`)"}`);
say();

if (!newSlug) throw new Error("the proposed slug is empty");
if (newSlug === oldSlug) {
  say("The slug already matches the title. Nothing to do.");
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(0);
}

const clash = bySlug.get(newSlug);
if (clash && String(clash.id) !== String(product.id)) {
  say(`**REFUSED** — \`${newSlug}\` already belongs to \`${clash.id}\` (${clash.title ?? clash.name}).`);
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(1);
}

/*
  The slug named Super Mario Bros. Wonder. Before changing anything, check that
  the real Wonder product is a separate document and did not have this one's
  data written into it — a wrong slug and a cross-game write look alike from
  here, and only one of them is fixed by renaming.
*/
say(`## Is another product implicated?`);
say();
const strangers = new Set(
  oldSlug
    .split("-")
    .filter((w) => w.length > 2 && !/^(switch|nintendo|edition|the|and)$/.test(w))
    .filter((w) => !slugifyTitle(title).split("-").includes(w)),
);
say(`Words in the old slug that its title does not explain: ${[...strangers].map((w) => `\`${w}\``).join(", ") || "none"}.`);
say();
const suspects = [...live.values()].filter(
  (p) =>
    String(p.id) !== String(product.id) &&
    [...strangers].filter((w) => `${p.slug ?? ""} ${p.title ?? p.name ?? ""}`.toLowerCase().includes(w)).length >= 2,
);
if (!suspects.length) say("No other product answers to those words.");
else {
  say(`| product | slug | title | hidden |`);
  say(`| --- | --- | --- | --- |`);
  for (const s of suspects) {
    say(`| \`${s.id}\` | \`${s.slug}\` | ${s.title ?? s.name} | ${s.isHidden === true ? "yes" : "no"} |`);
  }
  say();
  say(
    "Those are separate documents with their own ids. This is a wrong slug on one product, not one game's data written onto another.",
  );
}
say();

if (!APPLY) {
  say(`_Inspect only — nothing written._`);
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(0);
}

const nowIso = () => new Date().toISOString();

/* The alias goes in first: if it fails, the old URL is still the working one. */
await app.d1Run(
  "INSERT INTO game_aliases (id, game_id, alias, normalized, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)" +
    " ON CONFLICT(normalized) DO UPDATE SET game_id = excluded.game_id",
  `alias_reslug_${String(product.id).replace(/^prd_/, "")}`,
  String(product.id),
  oldSlug,
  oldSlug.toLowerCase(),
  "former_slug",
  nowIso(),
);
const alias = await app.d1All("SELECT game_id FROM game_aliases WHERE normalized = ?", oldSlug.toLowerCase());
const aliasOk = String(alias?.[0]?.game_id ?? "") === String(product.id);
say(`- old slug \`${oldSlug}\` kept as an alias: ${aliasOk ? "**stored and read back**" : "**FAILED**"}`);
if (!aliasOk) {
  say("- **not renaming — an existing link would 404.**");
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(1);
}

await app.d1Run(
  "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
    " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  `store:product:${product.id}`,
  JSON.stringify({ ...product, slug: newSlug, updatedAt: nowIso() }),
  nowIso(),
);
const back = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${product.id}`);
let stored = null;
try {
  stored = back?.[0]?.value ? JSON.parse(String(back[0].value)) : null;
} catch {
  stored = null;
}
const renamed = String(stored?.slug ?? "") === newSlug;
say(`- slug written and read back: ${renamed ? `**\`${newSlug}\`**` : "**FAILED**"}`);
if (!renamed) process.exitCode = 1;
say();

writeFileSync(OUT, lines.join("\n") + "\n");
