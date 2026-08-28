#!/usr/bin/env node
/**
 * Builds the Hong Kong language lookup, once, so the audit does not have to.
 *
 * Hong Kong publishes no product code — nothing that joins to the five
 * characters Nintendo keys Japan by — so the only durable way to know what a
 * Hong Kong account will read is to walk the storefront's own catalogue and
 * record, per eShop id, the name it sells under and the languages it ships.
 *
 * That is a few hundred page fetches. Doing it inside the audit would repeat
 * them on every run; doing it here writes a file the audit reads, which is also
 * a file a person can open and correct when a title's Chinese name is not one a
 * machine would match.
 *
 * WRITES ONE LOCAL FILE. It touches no product and no database.
 */

import { writeFileSync } from "node:fs";

import { fetchHkCatalogue, fetchHkTitle } from "./lib/region-language.mjs";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const OUT = flag("out", "data/nintendo-hong-kong-languages.json");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", "6")));

const catalogue = await fetchHkCatalogue();
console.log(`Hong Kong catalogue entries with an eShop id: ${catalogue.length}`);
if (!catalogue.length) throw new Error("the Hong Kong catalogue came back empty — refusing to write nothing");

/* One entry per id: the catalogue lists a game once per storefront placement. */
const byNsuid = new Map();
for (const entry of catalogue) if (!byNsuid.has(entry.nsuid)) byNsuid.set(entry.nsuid, entry);
const work = [...byNsuid.values()];
console.log(`distinct eShop ids to read: ${work.length}`);

const rows = [];
let done = 0;
let failed = 0;

async function worker() {
  for (;;) {
    const entry = work.shift();
    if (!entry) return;
    const page = await fetchHkTitle(entry.nsuid);
    done++;
    if (!page.ok || !page.languages?.length) {
      failed++;
      rows.push({
        nsuid: entry.nsuid,
        catalogueTitle: entry.title,
        storeName: "",
        languages: null,
        note: `unreadable — HTTP ${page.status ?? "?"}`,
      });
    } else {
      rows.push({
        nsuid: entry.nsuid,
        catalogueTitle: entry.title,
        storeName: page.formalName,
        languages: page.languages,
        catalogueLang: entry.catalogueLang,
        publisher: entry.publisher,
        releaseDate: entry.releaseDate,
      });
    }
    if (done % 25 === 0) console.log(`  ${done} read, ${failed} unreadable`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

rows.sort((a, b) => String(a.nsuid).localeCompare(String(b.nsuid)));
const withLanguages = rows.filter((r) => r.languages?.length).length;
console.log(`read ${rows.length}, with a language list: ${withLanguages}, unreadable: ${failed}`);
if (withLanguages < rows.length / 2) {
  throw new Error("more than half the storefront came back unreadable — refusing to write a broken index");
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "https://www.nintendo.com.hk/data/json/switch_software.json + https://ec.nintendo.com/HK/zh/titles/<nsuid>",
      builtAt: new Date().toISOString(),
      count: rows.length,
      withLanguages,
      titles: rows,
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote ${OUT}`);
