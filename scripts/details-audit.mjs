#!/usr/bin/env node
/**
 * How complete every canonical Nintendo game is, field by field.
 *
 * READ ONLY. There is no apply flag.
 *
 * Field names are parsed out of `src/lib/gameImportSchema.ts`, which is the
 * mapping the importer itself writes through. Earlier passes of this work
 * reported data missing that was only stored under a different name —
 * `performance` for `devicePerformance`, `story` for `storyChapters` — so
 * nothing here is checked against a name that was guessed rather than read.
 *
 * `false` counts as an answer. A game that genuinely does not need a game-key
 * card has `nintendoGameKeyCard: false`, and calling that a gap sends someone
 * to research a field that is already right.
 *
 * The report also names two things a per-field count cannot see: a slug that
 * describes a different game than its title does, and two documents that are
 * the same game on the same console.
 */

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const OFFSET = Number(flag("offset", "0"));
const LIMIT = Number(flag("limit", "0"));
const OUT = flag("out", "details-audit.md");

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

/* ------------------------------------------------------- the canonical names */

const SCHEMA_FILE = "src/lib/gameImportSchema.ts";
const TARGETS = new Set();
for (const m of readFileSync(SCHEMA_FILE, "utf8").matchAll(/target:\s*"([^"]+)"/g)) TARGETS.add(m[1]);
if (TARGETS.size < 150) throw new Error(`only ${TARGETS.size} targets parsed from ${SCHEMA_FILE}`);

const GROUPS = {
  identity: ["title", "titleAr", "slug", "platform", "edition", "region", "category", "kind"],
  basic: [
    "developer", "publisher", "releaseDate", "genres", "ageRating", "numberOfPlayers",
    "supportedLanguages", "languagesAudio", "languagesText", "size", "downloadSizeGb", "youtubeTrailer",
  ],
  pricing: ["price", "cost", "stock", "isInfiniteStock", "options", "types"],
  media: ["cartridgeImage", "nintendoCardImage", "coverImage", "coverHiResImage", "bannerImages", "galleryImages"],
  nintendo: [
    "nintendoNotes", "nintendoPlayModes", "nintendoCloudSaves", "nintendoOnlineRequired",
    "nintendoGameKeyCard", "tvMode", "tabletopMode", "handheldMode",
  ],
  switch2: ["switch2Enhanced", "switch2Exclusive", "switch2UpgradePrice", "switch2Features"],
  performance: ["devicePerformance", "perfResolutionHandheld", "perfResolutionDocked", "perfFps"],
  detail: [
    "tagline", "fitFor", "notFitFor", "gameplayPillars", "worldSummary", "storyChapters",
    "editionsList", "dlc", "guides", "faq", "verdictScore", "verdictPros", "verdictCons",
    "reviews", "timeline", "patchNotes", "soundtrack", "seriesName", "seriesEntries",
    "studioName", "sources", "features", "completionMain", "playTimeMain",
    "mpLocalPlayers", "mpOnlinePlayers", "mpCoop", "storageNotes",
  ],
};
for (const [group, fields] of Object.entries(GROUPS)) {
  const unknown = fields.filter((f) => !TARGETS.has(f));
  if (unknown.length) throw new Error(`group ${group} names fields the schema does not define: ${unknown.join(", ")}`);
}
const ALL_FIELDS = Object.values(GROUPS).flat();

/** `false` is an answer. An empty string, an empty list and null are not. */
const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return Boolean(v.trim());
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some((x) => filled(x));
  if (typeof v === "object") return Object.values(v).some((x) => filled(x));
  return false;
};

/* -------------------------------------------------------- the live catalogue */

const outfile = path.resolve(".details-audit-bundle.mjs");
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

const isGame = (d) => {
  const cat = `${d?.categoryId ?? ""} ${d?.category ?? ""}`.toLowerCase();
  if (/hardware|accessor|amiibo|gift|console|controller/.test(cat)) return false;
  return /game/.test(cat);
};
const platformOf = (p) => {
  const raw = String(p?.platform ?? p?.console ?? "").toLowerCase();
  return /2/.test(raw.replace(/switch\s*1/g, "")) ? "switch2" : "switch1";
};

const all = [...live.values()].filter(isGame).sort((a, b) =>
  String(a.slug ?? a.id).localeCompare(String(b.slug ?? b.id)),
);
const games = all.slice(OFFSET, LIMIT > 0 ? OFFSET + LIMIT : undefined);

say(`# Game details audit — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- canonical fields the importer can write: **${TARGETS.size}**`);
say(`- fields checked here, grouped: **${ALL_FIELDS.length}**`);
say(`- canonical Nintendo games in production: **${all.length}**`);
say(`- audited in this run: **${games.length}**`);
say();

/* ------------------------------------------------------------ per game */

const groupNames = Object.keys(GROUPS);
const scored = games.map((doc) => {
  const perGroup = {};
  const missing = [];
  for (const [group, fields] of Object.entries(GROUPS)) {
    const have = fields.filter((f) => filled(doc[f]));
    perGroup[group] = { have: have.length, of: fields.length };
    for (const f of fields) if (!filled(doc[f])) missing.push(f);
  }
  const have = ALL_FIELDS.filter((f) => filled(doc[f])).length;
  return {
    doc,
    slug: String(doc.slug || doc.id),
    title: String(doc.title || doc.name || ""),
    platform: platformOf(doc),
    hidden: doc.isHidden === true,
    perGroup,
    missing,
    have,
    score: Math.round((have / ALL_FIELDS.length) * 100),
  };
});

say(`## Completeness per game`);
say();
say(`| game | platform | visible | ${groupNames.map((g) => `${g} `).join(" | ")} | overall |`);
say(`| --- | --- | --- | ${groupNames.map(() => "---").join(" | ")} | ---: |`);
for (const s of [...scored].sort((a, b) => a.score - b.score)) {
  const cells = groupNames.map((g) => `${s.perGroup[g].have}/${s.perGroup[g].of}`).join(" | ");
  say(`| \`${s.slug}\` | ${s.platform} | ${s.hidden ? "hidden" : "live"} | ${cells} | **${s.score}%** |`);
}
say();

/* --------------------------------------------------- what is missing most */

const gaps = new Map();
for (const s of scored) for (const f of s.missing) gaps.set(f, (gaps.get(f) ?? 0) + 1);

say(`## The fields most often empty`);
say();
say(`| field | group | games missing it | share |`);
say(`| --- | --- | ---: | ---: |`);
const groupOf = (field) => Object.entries(GROUPS).find(([, fs]) => fs.includes(field))?.[0] ?? "?";
for (const [field, n] of [...gaps.entries()].sort((a, b) => b[1] - a[1])) {
  say(`| \`${field}\` | ${groupOf(field)} | ${n} | ${Math.round((n / scored.length) * 100)}% |`);
}
say();

/* ------------------------------------------------- what a count cannot see */

const norm = (t) =>
  String(t ?? "")
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/*
  The listing suffix, not part of the name.

  Several documents carry `[Switch 2]` on the end of the title for the admin
  list. Two documents for one game — `mario-kart-world` titled "Mario Kart World
  [Switch 2]" and `mario-kart-world-switch-2` titled "Mario Kart World" — differ
  only by that, so comparing the raw titles finds nothing. An edition name like
  "– Nintendo Switch 2 Edition" is NOT stripped: that names a different SKU that
  Nintendo sells separately, and collapsing it would merge two real products.
*/
const displayTitle = (t) => String(t ?? "").replace(/\s*\[(switch\s*[12]|nintendo switch\s*[12]?)\]\s*$/i, "").trim();

/*
  Words that say which console or edition, not which game.

  Every slug carries some of these and most titles carry others, so leaving them
  in makes two unrelated games look half-alike: "Super Mario Party Jamboree –
  Nintendo Switch 2 Edition" and a slug ending `-switch-2-edition` already share
  two words before either says what the game is.
*/
const PLATFORM_WORDS = new Set([
  "switch", "nintendo", "edition", "editions", "the", "and", "for", "with", "version", "deluxe",
]);

/**
 * The words that actually name a game, as a slug would carry them.
 *
 * A slug is generated by `slugifyTitle`, which spells `+` as "plus", `&` as
 * "and", and drops apostrophes — so "Super Mario 3D World + Bowser's Fury"
 * legitimately becomes `...-plus-bowsers-fury`. Tokenising the title without
 * those same substitutions makes "plus" and "bowsers" look like words from
 * another game, which is a false report about a correct slug. The title is put
 * through the same spelling before it is compared.
 */
const tokens = (text) =>
  new Set(
    String(text ?? "")
      .replace(/[™®©]/g, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019]/g, "")
      .replace(/&/g, " and ")
      .replace(/\+/g, " plus ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((w) => w.replace(/\d+$/, ""))
      .filter((w) => w.length > 2 && !PLATFORM_WORDS.has(w)),
  );

say(`## A slug that names a different game than its title does`);
say();
/*
  Once the console and edition words are gone, every remaining word in a slug
  came from some title. Two or more of them that are not in *this* title means
  the slug was built from a different game's name — which is exactly the case of
  `super-mario-bros-wonder-switch-2-edition-bellabel-park` sitting on a document
  titled "Super Mario Party Jamboree". Comparing how much the two share instead
  misses it, because both games are Super Mario.
*/
const slugMismatch = scored
  .map((s) => {
    const inTitle = tokens(displayTitle(s.title));
    const inSlug = tokens(s.slug);
    const strangers = [...inSlug].filter((w) => !inTitle.has(w));
    const absent = [...inTitle].filter((w) => !inSlug.has(w));
    return { ...s, strangers, absent };
  })
  .filter((s) => s.strangers.length >= 2);
if (!slugMismatch.length) say("None.");
else {
  say(`| slug | title | words in the slug that are not in the title |`);
  say(`| --- | --- | --- |`);
  for (const s of slugMismatch) {
    say(`| \`${s.slug}\` | ${s.title} | ${s.strangers.join(", ")}${s.absent.length ? ` · title words absent from the slug: ${s.absent.join(", ")}` : ""} |`);
  }
}
say();

say(`## Two documents that are the same game on the same console`);
say();
const byIdentity = new Map();
for (const s of scored) {
  const key = `${norm(displayTitle(s.title))}|${s.platform}`;
  if (!byIdentity.has(key)) byIdentity.set(key, []);
  byIdentity.get(key).push(s);
}
const dupes = [...byIdentity.values()].filter((g) => g.length > 1);
if (!dupes.length) say("None.");
else {
  say(`| title | platform | documents |`);
  say(`| --- | --- | --- |`);
  for (const group of dupes) {
    say(
      `| ${displayTitle(group[0].title)} | ${group[0].platform} | ${group.map((s) => `\`${s.slug}\` (${s.score}%, ${s.hidden ? "hidden" : "live"})`).join(" · ")} |`,
    );
  }
}
say();

/* ------------------------------------------------------------------ totals */

say(`## Summary`);
say();
const bands = { "100%": 0, "80–99%": 0, "60–79%": 0, "40–59%": 0, "under 40%": 0 };
for (const s of scored) {
  if (s.score === 100) bands["100%"]++;
  else if (s.score >= 80) bands["80–99%"]++;
  else if (s.score >= 60) bands["60–79%"]++;
  else if (s.score >= 40) bands["40–59%"]++;
  else bands["under 40%"]++;
}
say(`| completeness | games |`);
say(`| --- | ---: |`);
for (const [band, n] of Object.entries(bands)) say(`| ${band} | ${n} |`);
say();
const mean = Math.round(scored.reduce((a, s) => a + s.score, 0) / (scored.length || 1));
say(`- mean completeness: **${mean}%**`);
say(`- games with every media role filled: **${scored.filter((s) => s.perGroup.media.have === s.perGroup.media.of).length}**`);
say(`- games with no media at all: **${scored.filter((s) => s.perGroup.media.have === 0).length}**`);
say(`- slug/title mismatches: **${slugMismatch.length}**`);
say(`- same-game duplicate pairs: **${dupes.length}**`);
say();

writeFileSync(OUT, lines.join("\n") + "\n");
