#!/usr/bin/env node
/**
 * Which of these games a Japanese or Hong Kong account can actually read.
 *
 * READ ONLY. There is no apply flag; this establishes the facts, and writing
 * the notice onto products is a separate, deliberate step.
 *
 * The accounts sold here are Japanese and Hong Kong ones. A game's language is
 * a property of the regional SKU, not of the game, so the two lists are fetched
 * from the two regions' own catalogues and never merged: a title can be
 * Chinese-and-English in Hong Kong and Japanese-only in Japan, and averaging
 * those into one answer is how a customer ends up with a game they cannot read.
 *
 * Region has nothing to do with artwork here — a US sleeve is the same box.
 *
 * A game whose regional SKU cannot be established is reported as NEEDS_RESEARCH
 * with the reason. It is never filled in from the other region or from the US
 * listing, which is a different SKU again.
 */

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ARABIC_REGION_NOTICE,
  ARABIC_WARNING,
  VERDICTS,
  classify,
  fetchJpRows,
  hkIndexFrom,
  iCode,
  matchHk,
  matchJp,
} from "./lib/region-language.mjs";
import { metadataFrom, resolveProduct } from "./lib/nintendo-store.mjs";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const OFFSET = Number(flag("offset", "0"));
const LIMIT = Number(flag("limit", "0"));
const ONLY = flag("products", "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = flag("out", "language-audit.md");

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

const outfile = path.resolve(".language-audit-bundle.mjs");
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

/* -------------------------------------------------------- the live catalogue */

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

const isGame = (d) => {
  const cat = `${d?.categoryId ?? ""} ${d?.category ?? ""}`.toLowerCase();
  if (/hardware|accessor|amiibo|gift|console|controller/.test(cat)) return false;
  return /game/.test(cat);
};
const platformOf = (p) => {
  const raw = String(p?.platform ?? p?.console ?? "").toLowerCase();
  return /2/.test(raw.replace(/switch\s*1/g, "")) ? "switch2" : "switch1";
};

let games = [...live.values()].filter(isGame).sort((a, b) =>
  String(a.slug ?? a.id).localeCompare(String(b.slug ?? b.id)),
);
const total = games.length;
if (ONLY.length) {
  const want = new Set(ONLY);
  games = games.filter((g) => want.has(String(g.id)) || want.has(String(g.slug)));
}
games = games.slice(OFFSET, LIMIT > 0 ? OFFSET + LIMIT : undefined);

say(`# Language and region audit — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- canonical Nintendo games in production: **${total}**`);
say(`- audited in this run: **${games.length}**${OFFSET || LIMIT ? ` (offset ${OFFSET}, limit ${LIMIT || "none"})` : ""}`);
say();
say(
  "Japan and Hong Kong are asked separately, of their own catalogues, and the two answers are never merged.",
);
say();

/* ----------------------------------------------------------- the identities */

const identities = [];
for (const doc of games) {
  const slug = String(doc.slug || doc.id);
  const platform = platformOf(doc);
  let code = iCode(doc.product_code);
  let source = code ? "stored `product_code`" : "";
  if (!code) {
    const resolved = await resolveProduct({
      title: doc.title || doc.name,
      titleEn: doc.title_en,
      slug: doc.slug,
      platform,
      nintendoEshopUrl: doc.nintendoEshopUrl,
    });
    if (resolved.product) {
      const meta = metadataFrom(resolved.product);
      code = iCode(meta.product_code);
      source = code ? "resolved from the Nintendo store page" : "";
    }
  }
  identities.push({
    id: String(doc.id),
    slug,
    title: String(doc.title || doc.name || ""),
    titleEn: String(doc.title_en || doc.title || doc.name || ""),
    platform,
    releaseDate: String(doc.releaseDate ?? ""),
    code,
    codeSource: source,
  });
}

/* --------------------------------------------------------------- Japan */

const jpRows = [];
const codes = [...new Set(identities.map((i) => i.code).filter(Boolean))];
for (let i = 0; i < codes.length; i += 40) {
  jpRows.push(...(await fetchJpRows(codes.slice(i, i + 40))));
}
say(`- Japanese catalogue rows fetched for ${codes.length} product code(s): **${jpRows.length}**`);

/* ----------------------------------------------------------- Hong Kong */

/*
  Hong Kong publishes no product code, so the join is the name — and reading a
  few hundred storefront pages is not something an audit should do on every run.
  `scripts/build-hong-kong-index.mjs` reads them once into this file, which is
  also where a title whose Chinese name no comparison would match can be
  corrected by hand.
*/
const HK_INDEX_FILE = flag("hk-index", "data/nintendo-hong-kong-languages.json");
let hkJson = null;
try {
  hkJson = JSON.parse(readFileSync(HK_INDEX_FILE, "utf8"));
} catch (err) {
  throw new Error(
    `${HK_INDEX_FILE} is missing or unreadable (${String(err?.message ?? err)}) — run scripts/build-hong-kong-index.mjs first`,
  );
}
const hkIndex = hkIndexFrom(hkJson);
say(`- Hong Kong index built ${hkJson.builtAt}: **${hkJson.withLanguages}** of ${hkJson.count} storefront titles carry a language list`);
say();
say(
  "Nintendo Hong Kong publishes the titles it distributes, which is narrower than everything the Hong Kong eShop sells. A game absent from that list is reported as needing research, not as having no English.",
);
say();

/* ------------------------------------------------------------- the verdicts */

const results = [];
for (const identity of identities) {
  const jp = identity.code
    ? matchJp(jpRows, identity)
    : { row: null, reason: "no product code — the Nintendo SKU was not established" };
  const hk = matchHk(hkIndex, [identity.titleEn, identity.title, jp.row?.title]);
  const verdict = classify({ jpLanguages: jp.row?.languages ?? null, hkLanguages: hk.row?.languages ?? null });
  results.push({ identity, jp, hk, ...verdict });
}

say(`## Per game`);
say();
say(`| game | platform | code | Japan SKU | Japan languages | Japan | Hong Kong SKU | Hong Kong languages | Hong Kong | combined |`);
say(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const r of results) {
  const jpLangs = r.jp.row?.languages?.join(", ") ?? `— ${r.jp.reason}`;
  const hkLangs = r.hk.row?.languages?.join(", ") ?? `— ${r.hk.why}`;
  say(
    `| \`${r.identity.slug}\` | ${r.identity.platform} | ${r.identity.code || "—"} | ${r.jp.row?.title ?? "—"} | ${jpLangs} | **${r.japan}** | ${r.hk.row?.storeName || r.hk.row?.catalogueTitle || "—"} | ${hkLangs} | **${r.hongKong}** | ${r.verdict} |`,
  );
}
say();

say(`## What each game's customers should be told`);
say();
say(
  "Each account region gets its own line, because that is what a customer buys. A settled Japanese answer is worth telling someone while Hong Kong is still open.",
);
say();
say(`| game | Japan notice | Hong Kong notice |`);
say(`| --- | --- | --- |`);
for (const r of results) {
  say(
    `| \`${r.identity.slug}\` | ${ARABIC_REGION_NOTICE.japan[r.japan]} | ${ARABIC_REGION_NOTICE.hongKong[r.hongKong]} |`,
  );
}
say();
say(`Where both regions are settled, the combined notice is:`);
say();
say(`| game | combined | Arabic notice |`);
say(`| --- | --- | --- |`);
for (const r of results.filter((x) => x.verdict !== VERDICTS.RESEARCH)) {
  say(`| \`${r.identity.slug}\` | ${r.verdict} | ${ARABIC_WARNING[r.verdict] || "— no notice needed"} |`);
}
say();

say(`## Summary`);
say();
const tally = {};
for (const r of results) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
say(`| combined verdict | games |`);
say(`| --- | ---: |`);
for (const key of [VERDICTS.UNLOCKED, VERDICTS.VARIANT, VERDICTS.LOCKED, VERDICTS.RESEARCH]) {
  say(`| ${key} | ${tally[key] ?? 0} |`);
}
say();
const per = (which) => {
  const t = {};
  for (const r of results) t[r[which]] = (t[r[which]] ?? 0) + 1;
  return t;
};
const jpTally = per("japan");
const hkTally = per("hongKong");
say(`| account region | English confirmed | no English | still open |`);
say(`| --- | ---: | ---: | ---: |`);
say(`| Japan | ${jpTally.ENGLISH ?? 0} | ${jpTally.NO_ENGLISH ?? 0} | ${jpTally.NEEDS_RESEARCH ?? 0} |`);
say(`| Hong Kong | ${hkTally.ENGLISH ?? 0} | ${hkTally.NO_ENGLISH ?? 0} | ${hkTally.NEEDS_RESEARCH ?? 0} |`);
say();
say(`- Japanese SKU established: **${results.filter((r) => r.jp.row).length}** of ${results.length}`);
say(`- Hong Kong SKU established: **${results.filter((r) => r.hk.row).length}** of ${results.length}`);
say();

writeFileSync(OUT, lines.join("\n") + "\n");
