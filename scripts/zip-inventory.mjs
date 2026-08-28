#!/usr/bin/env node
/**
 * The tracking list for the 76 source templates. Reads files; writes a report.
 *
 * Touches neither D1 nor R2 — this is the inventory that has to exist before
 * anything is corrected, so that a record can never be silently dropped. Every
 * file appears in the output whatever state it is in.
 *
 * The file number is not an identifier. Numbers repeat across the archive
 * (`01-` appears four times), so a record is identified by its slug, and the
 * platform and edition are carried alongside for the match against production.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = (process.argv.find((a) => a.startsWith("--dir=")) ?? "--dir=import-sources/nintendo-2026-08").split("=")[1];

const lines = [];
const say = (t = "") => {
  lines.push(t);
  console.log(t);
};

/** The template format: `key=value`, with `key<<EOF … EOF` for prose blocks. */
export function parseTemplate(text) {
  const out = {};
  const src = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const heredoc = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)<<([A-Za-z0-9_]+)$/);
    if (heredoc) {
      const body = [];
      i++;
      while (i < src.length && src[i].trim() !== heredoc[2]) body.push(src[i++]);
      if (!(heredoc[1] in out)) out[heredoc[1]] = body.join("\n");
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

/** Every `type.N.*` row, in file order. */
export function typesOf(doc) {
  const indexes = [...new Set(
    Object.keys(doc)
      .map((k) => k.match(/^type\.(\d+)\./)?.[1])
      .filter(Boolean),
  )].sort((a, b) => Number(a) - Number(b));
  return indexes.map((i) => ({
    index: Number(i),
    id: doc[`type.${i}.id`] ?? "",
    name: doc[`type.${i}.name`] ?? "",
    optionId: doc[`type.${i}.option_id`] ?? "",
    price: num(doc[`type.${i}.price`]),
    cost: num(doc[`type.${i}.cost`]),
  }));
}

const IMAGE_KEYS = [
  "front_cover_image",
  "cover_image",
  "box_front_url",
  "front_cover_hires_url",
  "cover_texture_url",
  "square_card_image",
  "cartridge_image",
];

const files = readdirSync(DIR).filter((f) => f.endsWith(".txt")).sort();
const records = files.map((file) => {
  const doc = parseTemplate(readFileSync(path.join(DIR, file), "utf8"));
  const types = typesOf(doc);
  const offline = types.filter((t) => t.optionId === "offline_account");
  const online = types.filter((t) => t.optionId === "online_account");
  return {
    file,
    slug: doc.slug ?? "",
    platform: doc.platform ?? "",
    title: doc.title || doc.name || "",
    edition: doc.edition ?? "",
    price: num(doc.price),
    cost: num(doc.cost),
    types,
    offline,
    online,
    images: Object.fromEntries(IMAGE_KEYS.map((k) => [k, (doc[k] ?? "").trim()])),
    doc,
  };
});

say(`# Source inventory — ${records.length} template(s) in \`${DIR}\``);
say();
say(`Read-only. No database and no object storage was contacted.`);
say();

/* ------------------------------------------------------------- the tracking table */

say(`## Tracking list`);
say();
say(`| # | file | slug | platform | base price | base cost | offline types | online types |`);
say(`| ---: | --- | --- | --- | ---: | ---: | --- | --- |`);
records.forEach((r, i) => {
  const fmt = (t) => `${t.name || t.id}: ${t.price ?? "—"}/${t.cost ?? "—"}`;
  say(
    `| ${i + 1} | \`${r.file}\` | \`${r.slug}\` | ${r.platform} | ${r.price ?? "—"} | ${r.cost ?? "—"} | ` +
      `${r.offline.map(fmt).join("<br>") || "—"} | ${r.online.map(fmt).join("<br>") || "—"} |`,
  );
});
say();

/* --------------------------------------------------------------------- findings */

const dup = new Map();
for (const r of records) dup.set(r.slug, (dup.get(r.slug) ?? 0) + 1);
const repeated = [...dup.entries()].filter(([, n]) => n > 1);

const baseEq = records.filter((r) => r.price !== null && r.cost !== null && r.price === r.cost);
const offEq = records.flatMap((r) => r.offline.filter((t) => t.price !== null && t.price === t.cost).map((t) => ({ r, t })));
const onEq = records.flatMap((r) => r.online.filter((t) => t.price !== null && t.price === t.cost).map((t) => ({ r, t })));
const zeroPrice = records.flatMap((r) => r.types.filter((t) => t.price === 0).map((t) => ({ r, t })));
const specialOffline = records.flatMap((r) =>
  r.types.filter((t) => /special/i.test(t.name) && t.optionId === "offline_account").map((t) => ({ r, t })),
);
const noOnline = records.filter((r) => !r.online.length);
const noOffline = records.filter((r) => !r.offline.length);
const onlineNotDearer = records.filter((r) => {
  const on = r.online.map((t) => t.price).filter((p) => p !== null);
  const off = r.offline.map((t) => t.price).filter((p) => p !== null);
  return on.length && off.length && Math.min(...on) <= Math.max(...off);
});

say(`## Findings`);
say();
say(`| | |`);
say(`| --- | ---: |`);
say(`| Templates | ${records.length} |`);
say(`| Distinct slugs | ${dup.size} |`);
say(`| Repeated slugs | ${repeated.length} |`);
say(`| Switch 1 / Switch 2 | ${records.filter((r) => r.platform === "switch1").length} / ${records.filter((r) => r.platform === "switch2").length} |`);
say(`| Base \`price\` equals \`cost\` | ${baseEq.length} |`);
say(`| Offline type rows priced at cost | ${offEq.length} of ${records.reduce((n, r) => n + r.offline.length, 0)} |`);
say(`| Online type rows priced at cost | ${onEq.length} of ${records.reduce((n, r) => n + r.online.length, 0)} |`);
say(`| Type rows priced at zero | ${zeroPrice.length} |`);
say(`| "Special" types attached to the offline option | ${specialOffline.length} |`);
say(`| Templates with no online type | ${noOnline.length} |`);
say(`| Templates with no offline type | ${noOffline.length} |`);
say(`| Templates where online is not dearer than offline | ${onlineNotDearer.length} |`);
say();

for (const [label, rows] of [
  ["Types named Special attached to the offline option", specialOffline],
  ["Type rows priced at zero", zeroPrice],
]) {
  say(`### ${label} (${rows.length})`);
  say();
  say(`| file | type | option | price | cost |`);
  say(`| --- | --- | --- | ---: | ---: |`);
  for (const { r, t } of rows) say(`| \`${r.file}\` | ${t.name} | \`${t.optionId}\` | ${t.price ?? "—"} | ${t.cost ?? "—"} |`);
  say();
}

if (onlineNotDearer.length) {
  say(`### Online not dearer than offline (${onlineNotDearer.length})`);
  say();
  for (const r of onlineNotDearer) {
    say(`- \`${r.file}\`: offline ${r.offline.map((t) => t.price).join(", ")} · online ${r.online.map((t) => t.price).join(", ")}`);
  }
  say();
}

/* ------------------------------------------------------------------- the images */

say(`## Image fields as the templates carry them`);
say();
say(`| field | filled | empty | absent |`);
say(`| --- | ---: | ---: | ---: |`);
for (const key of IMAGE_KEYS) {
  const filled = records.filter((r) => r.images[key]).length;
  const empty = records.filter((r) => key in r.doc && !r.images[key]).length;
  const absent = records.filter((r) => !(key in r.doc)).length;
  say(`| \`${key}\` | ${filled} | ${empty} | ${absent} |`);
}
say();
say(`Nothing here has been fetched. "Filled" means a string is present, which is`);
say(`not the same as an image existing at the other end — that is the next pass.`);
say();

writeFileSync("zip-inventory.md", lines.join("\n") + "\n");
writeFileSync(
  "zip-inventory.json",
  JSON.stringify(
    records.map(({ doc, ...rest }) => rest),
    null,
    1,
  ),
);
