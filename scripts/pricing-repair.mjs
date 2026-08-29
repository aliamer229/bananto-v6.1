#!/usr/bin/env node
/**
 * Puts a selling price on games already in production that are still priced at
 * what they cost.
 *
 * DRY RUN BY DEFAULT — `--apply` is required before anything is written.
 *
 * The templates these products were built from wrote one supplier number into
 * both `price` and `cost`, so the storefront has been offering acquisition
 * figures — 1,500 IQD, 1,750 IQD — as customer prices. This reads the cost back
 * out of each option row, prices the game through the same engine the importer
 * uses, and writes the result as a product overlay.
 *
 * What it will not do:
 *
 *   - touch a row that already earns a margin. A price above cost is somebody's
 *     decision; it is reported and left alone.
 *   - invent a cost. A row with no usable number is reported and the product is
 *     skipped whole, because pricing three of four tiers leaves a product whose
 *     options disagree with each other.
 *   - write a price at or below cost. That is the one condition this exists to
 *     remove, so it is also the condition that aborts a write.
 *
 * Nothing but `price`, `cost`, `types` and `options` is rewritten; the document
 * is otherwise carried across untouched.
 */

import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import path from "node:path";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const APPLY = process.argv.includes("--apply");
const ONLY = flag("products", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OFFSET = Number(flag("offset", "0"));
const LIMIT = Number(flag("limit", "0"));
const OUT = flag("out", "pricing-repair.md");

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

const outfile = path.resolve(".pricing-repair-bundle.mjs");
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

/*
  `d1All`/`d1Run` answer empty and do nothing when they cannot reach a database,
  which would let this script report a clean run over no data at all.
*/
const reachable = await app.d1All("SELECT count(*) AS n FROM store_kv");
if (!reachable.length) throw new Error("D1 is not reachable — refusing to report on nothing");

/* -------------------------------------------------------- the live catalogue */

async function loadCatalogue() {
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
  return live;
}

const isGame = (p) =>
  String(p?.kind ?? "") === "game" || String(p?.categoryId ?? p?.category ?? "").includes("nintendo");

const platformOf = (p) => {
  const raw = String(p?.platform ?? p?.console ?? "").toLowerCase();
  return /2/.test(raw.replace(/switch\s*1/g, "")) ? "switch2" : "switch1";
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The acquisition cost behind one stored option row.
 *
 * `cost` is the admin-only field and is read first — that is what it is for.
 * A row that carries only `price` is one the importer wrote a supplier number
 * into and never re-read, and the number is a cost whatever field it sits in;
 * the user's instruction is explicit that every monetary value arriving from
 * the supplier archive is a purchase cost. A row with neither is not guessed.
 */
function acquisitionCost(row) {
  const cost = num(row?.cost);
  if (cost !== null) return { amount: cost, source: "stored `cost`" };
  const price = num(row?.price);
  if (price !== null) return { amount: price, source: "stored `price` — supplier figure, no cost field" };
  return null;
}

/* ------------------------------------------------------------------ the work */

const live = await loadCatalogue();
const games = [...live.values()].filter(isGame);

say(`# Pricing repair — ${APPLY ? "**APPLY**" : "DRY RUN (nothing written)"}`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- live products: **${live.size}**`);
say(`- games considered: **${games.length}**`);

/* Which of them are actually selling at or below cost. */
const broken = [];
const healthy = [];
const noRows = [];
for (const p of games) {
  const types = Array.isArray(p.types) ? p.types : [];
  if (!types.length) {
    noRows.push(p);
    continue;
  }
  const atCost = types.filter((t) => {
    const c = acquisitionCost(t);
    const price = num(t?.price);
    return c && (price === null || price <= c.amount);
  });
  if (atCost.length) broken.push({ product: p, atCost: atCost.length, rows: types.length });
  else healthy.push(p);
}

say(`- games with no option rows at all: **${noRows.length}**${noRows.length ? ` — ${noRows.map((p) => p.slug || p.id).join(", ")}` : ""}`);
say(`- games where every row already earns a margin: **${healthy.length}**`);
say(`- games with at least one row priced at or below cost: **${broken.length}**`);
say();

let queue = broken;
if (ONLY.length) {
  const want = new Set(ONLY);
  queue = broken.filter(({ product }) => want.has(String(product.id)) || want.has(String(product.slug)));
  const missing = ONLY.filter(
    (k) => !broken.some(({ product }) => String(product.id) === k || String(product.slug) === k),
  );
  say(`- restricted to \`--products\`: **${queue.length}** of ${ONLY.length} named`);
  if (missing.length) {
    say(`- named but not in need of repair (or not found): ${missing.map((m) => `\`${m}\``).join(", ")}`);
  }
  say();
}
queue = queue.slice(OFFSET, LIMIT > 0 ? OFFSET + LIMIT : undefined);
say(`- this run will work on **${queue.length}** product(s).`);
say();

const nowIso = () => new Date().toISOString();
const results = [];

for (const { product } of queue) {
  const slug = String(product.slug || product.id);
  const platform = platformOf(product);
  const { tier, defaulted } = app.demandTierFor(slug);
  const types = Array.isArray(product.types) ? product.types : [];

  say(`## \`${slug}\` — ${product.title || product.name || "untitled"}`);
  say();
  say(`- id: \`${product.id}\` · platform: **${platform}** · demand tier: **${tier}**${defaulted ? " _(no entry — priced as standard)_" : ""} · hidden: **${product.isHidden || product.hidden ? "yes" : "no"}**`);
  say();

  /* Costs, read out of the rows the product already carries. */
  const costs = { unmapped: [] };
  const rowCost = new Map();
  let unusable = 0;
  say(`| stored row | option | stored price | stored cost | read as acquisition cost |`);
  say(`| --- | --- | ---: | ---: | --- |`);
  for (const t of types) {
    const c = acquisitionCost(t);
    if (!c) {
      unusable++;
      say(`| ${t?.name ?? t?.id ?? "?"} | \`${t?.optionId ?? "—"}\` | ${t?.price ?? "—"} | ${t?.cost ?? "—"} | **no usable number** |`);
      continue;
    }
    rowCost.set(t, c);
    const account =
      t?.optionId === "offline_account" ? "offline" : t?.optionId === "online_account" ? "online" : null;
    if (!account) {
      costs.unmapped.push(`${t?.name ?? t?.id ?? "?"} — no recognisable option`);
    } else {
      const key = `${account}${app.isExtrasRow(t?.name) ? "Extras" : "Base"}`;
      if (costs[key]) costs.unmapped.push(`${t?.name ?? t?.id ?? "?"} — ${key} was already taken`);
      else costs[key] = { amount: c.amount, source: `${t?.name ?? t?.id ?? "?"} (${c.source})` };
    }
    say(`| ${t?.name ?? t?.id ?? "?"} | \`${t?.optionId ?? "—"}\` | ${t?.price ?? "—"} | ${t?.cost ?? "—"} | ${c.amount.toLocaleString()} — ${c.source} |`);
  }
  say();

  if (unusable) {
    say(`**SKIPPED** — ${unusable} row(s) carry no usable number. Pricing the rest would leave this product's options disagreeing with each other.`);
    say();
    results.push({ slug, id: product.id, status: "SKIPPED_NO_COST" });
    continue;
  }
  if (costs.unmapped.length) {
    say(`**SKIPPED** — rows that could not be placed: ${costs.unmapped.join("; ")}`);
    say();
    results.push({ slug, id: product.id, status: "SKIPPED_UNMAPPED" });
    continue;
  }

  const pricing = app.priceGame(costs, platform, tier);
  const priceFor = new Map(pricing.tiers.map((t) => [`${t.account}_${t.content}`, t]));

  /* The new rows. A row that already earns a margin keeps the price it has. */
  const rebuilt = [];
  let repaired = 0;
  let kept = 0;
  say(`| customer sees | old price | old cost | new price | cost | profit | why |`);
  say(`| --- | ---: | ---: | ---: | ---: | ---: | --- |`);
  for (const t of types) {
    const c = rowCost.get(t);
    const account = t.optionId === "offline_account" ? "offline" : "online";
    const content = app.isExtrasRow(t?.name) ? "extras" : "base";
    const priced = priceFor.get(`${account}_${content}`);
    const oldPrice = num(t.price);
    const earnsMargin = oldPrice !== null && oldPrice > c.amount;

    const price = earnsMargin ? oldPrice : (priced?.price ?? 0);
    const label = app.customerTypeName(account, content);
    if (earnsMargin) kept++;
    else repaired++;

    rebuilt.push({
      ...t,
      name: label,
      price,
      cost: c.amount,
    });
    say(
      `| ${label} | ${t.price ?? "—"} | ${t.cost ?? "—"} | ${price.toLocaleString()} | ${c.amount.toLocaleString()} | ${(price - c.amount).toLocaleString()} | ${earnsMargin ? "already above cost — left as it was" : (priced?.reason ?? "no tier")} |`,
    );
  }
  say();

  /* The condition this script exists to remove is also the one that aborts. */
  const stillAtCost = rebuilt.filter((r) => !(r.price > r.cost));
  if (stillAtCost.length) {
    say(`**REFUSED** — ${stillAtCost.length} row(s) would still be at or below cost: ${stillAtCost.map((r) => `${r.name} ${r.price} ≤ ${r.cost}`).join("; ")}`);
    say();
    results.push({ slug, id: product.id, status: "REFUSED_UNPROFITABLE" });
    continue;
  }

  /* The options the rows hang off, named in the store's own Arabic. */
  const accounts = [...new Set(rebuilt.map((r) => (r.optionId === "offline_account" ? "offline" : "online")))];
  const existingOptions = Array.isArray(product.options) ? product.options : [];
  const options = accounts.map((account) => {
    const prior = existingOptions.find((o) => String(o?.id) === `${account}_account`) ?? {};
    return {
      ...prior,
      id: `${account}_account`,
      name: app.customerOptionName(account),
      description: prior.description || app.customerOptionName(account),
    };
  });

  const cheapest = rebuilt.reduce((a, b) => (b.price < a.price ? b : a));
  const doc = {
    ...product,
    options,
    types: rebuilt,
    price: cheapest.price,
    cost: cheapest.cost,
    updatedAt: nowIso(),
  };

  say(`- base product price ${product.price ?? "—"} → **${cheapest.price.toLocaleString()}**, cost ${product.cost ?? "—"} → **${cheapest.cost.toLocaleString()}** (cheapest option)`);
  say(`- rows repriced: **${repaired}** · rows left alone: **${kept}**`);
  if (pricing.needsReview.length) say(`- COST_NEEDS_REVIEW: ${pricing.needsReview.join("; ")}`);

  if (!APPLY) {
    say(`- _dry run — not written_`);
    say();
    results.push({ slug, id: product.id, status: "WOULD_REPAIR", repaired, kept });
    continue;
  }

  await app.d1Run(
    "INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `store:product:${product.id}`,
    JSON.stringify(doc),
    nowIso(),
  );
  const back = await app.d1All("SELECT value FROM store_kv WHERE key = ?", `store:product:${product.id}`);
  let stored = null;
  try {
    stored = back?.[0]?.value ? JSON.parse(String(back[0].value)) : null;
  } catch {
    stored = null;
  }
  const storedRows = Array.isArray(stored?.types) ? stored.types : [];
  const ok =
    storedRows.length === rebuilt.length && storedRows.every((r) => Number(r.price) > Number(r.cost));
  say(`- written and read back: ${ok ? "**verified — every stored row is above cost**" : "**READ-BACK FAILED**"}`);
  say();
  results.push({ slug, id: product.id, status: ok ? "REPAIRED" : "READBACK_FAILED", repaired, kept });
  if (!ok) process.exitCode = 1;
}

/* ------------------------------------------------------------------ summary */

say(`## Summary`);
say();
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
say(`| outcome | products |`);
say(`| --- | ---: |`);
for (const [status, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) say(`| ${status} | ${n} |`);
say();
say(`- still awaiting repair after this run: **${broken.length - results.filter((r) => r.status === "REPAIRED").length}**`);

writeFileSync(OUT, lines.join("\n") + "\n");
