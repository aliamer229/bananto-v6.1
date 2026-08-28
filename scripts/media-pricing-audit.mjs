#!/usr/bin/env node
/**
 * Read-only. Answers two questions about the live catalogue with evidence:
 * what is actually stored in every image role, and how price relates to cost.
 *
 * WRITES NOTHING. There is no apply flag.
 *
 * Every image URL is fetched, not merely inspected. A URL is not an image
 * because it ends in `.png` or lives on an image host — the Square Card and 3D
 * Texture fields on several products hold `switch-images-julio.com/.../display/
 * index.html?code=…`, which is a viewer page that answers `text/html`, and the
 * admin form is what noticed. This reports the response for each one so the
 * repair can be aimed at what is really wrong rather than at the URL's spelling.
 */

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

const flag = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const ONLY = flag("products", "");
const LIMIT = Number(flag("limit", "0"));
const PROBE = !process.argv.includes("--no-probe");

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

const outfile = path.resolve(".audit-bundle.mjs");
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
  const overlaid = new Set();
  for (const row of rows.filter((r) => String(r.key).startsWith("store:product:"))) {
    let doc = null;
    try {
      doc = JSON.parse(String(row.value));
    } catch {
      continue;
    }
    if (!doc?.id) continue;
    if (doc._deleted === true) live.delete(String(doc.id));
    else {
      live.set(String(doc.id), doc);
      overlaid.add(String(doc.id));
    }
  }
  return { live, overlaid };
}

/* ---------------------------------------------------------------- the roles */

/** Every field this catalogue can point at an image from, with its purpose. */
const ROLES = [
  ["cartridgeImage", "Front Box Cover"],
  ["nintendoCardImage", "Square Card Image"],
  ["coverImage", "Cover Image (detail hero)"],
  ["coverHiResImage", "3D Texture Source"],
  ["box_front_url", "Front box (legacy)"],
  ["box_back_url", "Back box (legacy)"],
  ["image", "Listing thumbnail"],
  ["banner", "Banner (single)"],
  ["cardArtwork", "Card artwork"],
  ["mainImage", "Main image"],
  ["packagingFrontImage", "Packaging front"],
  ["boxImage", "Box image"],
  ["modelTextureUrl", "3D model texture"],
];
const LIST_ROLES = [
  ["bannerImages", "Banner images"],
  ["galleryImages", "Gallery screenshots"],
  ["gallery", "Gallery (legacy)"],
  ["images", "Images (legacy)"],
];

const urlOf = (entry) =>
  typeof entry === "string"
    ? entry
    : entry && typeof entry === "object"
      ? String(entry.url ?? entry.image ?? entry.src ?? entry.imageUrl ?? "")
      : "";

function rolesOf(doc) {
  const out = [];
  for (const [field, purpose] of ROLES) {
    const url = String(doc[field] ?? "").trim();
    if (url) out.push({ field, purpose, url, index: null });
  }
  for (const [field, purpose] of LIST_ROLES) {
    const list = Array.isArray(doc[field]) ? doc[field] : [];
    list.forEach((entry, i) => {
      const url = urlOf(entry).trim();
      if (url) out.push({ field, purpose, url, index: i });
    });
  }
  return out;
}

/* --------------------------------------------------------------- the probe */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const probeCache = new Map();

/**
 * Asks the server what a URL actually is.
 *
 * The first bytes decide it, not the headers alone: a server can answer
 * `image/jpeg` and send an error page. The magic numbers for JPEG, PNG, GIF,
 * WebP and AVIF are checked against the body that arrives.
 */
async function probe(url) {
  if (probeCache.has(url)) return probeCache.get(url);
  const result = await (async () => {
    if (url.startsWith("data:")) return { kind: "embedded", detail: "inline data: URI" };
    if (url.startsWith("/api/") || !/^https?:\/\//i.test(url)) {
      return { kind: "internal", detail: "served by this worker from R2" };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "image/*,*/*" },
        signal: ctl.signal,
      });
      const type = String(res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!res.ok) return { kind: "http-error", status: res.status, detail: `HTTP ${res.status}`, type };
      const buf = Buffer.from(await res.arrayBuffer());
      const magic = sniff(buf);
      if (!magic) {
        const head = buf.subarray(0, 200).toString("utf8").replace(/\s+/g, " ").trim();
        return {
          kind: /^\s*<(!doctype|html)/i.test(head) ? "html" : "not-an-image",
          status: res.status,
          type,
          detail: `served ${type || "no content-type"}: ${head.slice(0, 70)}`,
          bytes: buf.length,
        };
      }
      return {
        kind: "image",
        status: res.status,
        type: type || magic,
        magic,
        bytes: buf.length,
        hash: createHash("sha256").update(buf).digest("hex").slice(0, 16),
      };
    } catch (err) {
      return { kind: "unreachable", detail: String(err?.message ?? err).slice(0, 70) };
    } finally {
      clearTimeout(timer);
    }
  })();
  probeCache.set(url, result);
  return result;
}

/** What the bytes say they are, regardless of what the header claimed. */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (buf.subarray(4, 8).toString("latin1") === "ftyp" && /avif|heic|mif1/.test(buf.subarray(8, 16).toString("latin1"))) {
    return "image/avif";
  }
  if (buf.subarray(0, 5).toString("latin1") === "<?xml" || buf.subarray(0, 4).toString("latin1") === "<svg") {
    return "image/svg+xml";
  }
  return null;
}

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

/* -------------------------------------------------------------------- main */

const { live, overlaid } = await loadCatalogue();
const isGame = (doc) => {
  const cat = `${doc?.categoryId ?? ""} ${doc?.category ?? ""}`.toLowerCase();
  if (/hardware|accessor|amiibo|gift|console|controller/.test(cat)) return false;
  return /game/.test(cat);
};

let products = [...live.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
if (ONLY) {
  const wanted = new Set(ONLY.split(",").map((s) => s.trim()).filter(Boolean));
  products = products.filter((p) => wanted.has(String(p.id)) || wanted.has(String(p.slug)));
}
if (LIMIT > 0) products = products.slice(0, LIMIT);

say(`# Media and pricing audit — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- Live products: **${live.size}** (games: ${[...live.values()].filter(isGame).length})`);
say(`- Audited in this run: **${products.length}**`);
say(`- Carrying a per-product overlay row: **${overlaid.size}**`);
say();

/* ---- pricing ---- */

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : null);

const pricing = products.map((p) => {
  const price = num(p.price);
  const cost = num(p.cost);
  const types = Array.isArray(p.types) ? p.types : [];
  const options = Array.isArray(p.options) ? p.options : [];
  return {
    id: String(p.id),
    title: String(p.title ?? p.name ?? ""),
    slug: String(p.slug ?? ""),
    hidden: p.isHidden === true,
    updatedAt: String(p.updatedAt ?? ""),
    price,
    cost,
    margin: price !== null && cost !== null ? price - cost : null,
    typeCount: types.length,
    optionCount: options.length,
    typePrices: types.map((t) => ({ name: String(t?.name ?? ""), price: num(t?.price), cost: num(t?.cost) })),
  };
});

say(`## Pricing`);
say();
say(`| product | hidden | price | cost | price − cost | types | last modified |`);
say(`| --- | :-: | ---: | ---: | ---: | ---: | --- |`);
for (const r of pricing) {
  say(
    `| ${r.title || r.slug} \`${r.id}\` | ${r.hidden ? "yes" : ""} | ${r.price ?? "—"} | ${r.cost ?? "—"} | ` +
      `${r.margin ?? "—"} | ${r.typeCount} | ${r.updatedAt.slice(0, 19) || "—"} |`,
  );
}
say();

const suspicious = pricing.filter((r) => r.price !== null && r.cost !== null && r.price <= r.cost);
say(`- Products whose selling price is at or below their recorded cost: **${suspicious.length}**`);
const noCost = pricing.filter((r) => r.cost === null || r.cost === 0);
say(`- Products with no recorded cost: **${noCost.length}**`);
say();
for (const r of pricing) {
  if (!r.typePrices.length) continue;
  say(`- \`${r.id}\` ${r.title}: ${r.typePrices.map((t) => `${t.name || "?"} price=${t.price ?? "—"} cost=${t.cost ?? "—"}`).join(" · ")}`);
}
say();

/* ---- media ---- */

const allRefs = [];
for (const p of products) for (const role of rolesOf(p)) allRefs.push({ product: p, ...role });

say(`## Media`);
say();
say(`- Image references across these products: **${allRefs.length}**`);
if (!PROBE) {
  say(`- (probing skipped)`);
} else {
  const unique = [...new Set(allRefs.map((r) => r.url))];
  say(`- Distinct URLs: **${unique.length}**`);
  say();
  const results = await mapWithLimit(unique, 8, (url) => probe(url));
  const byUrl = new Map(unique.map((u, i) => [u, results[i]]));

  const tally = new Map();
  for (const ref of allRefs) {
    const kind = byUrl.get(ref.url)?.kind ?? "unknown";
    tally.set(kind, (tally.get(kind) ?? 0) + 1);
  }
  say(`| what the server actually returned | references |`);
  say(`| --- | ---: |`);
  for (const [kind, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) say(`| ${kind} | ${n} |`);
  say();

  const bad = allRefs.filter((r) => !["image", "internal"].includes(byUrl.get(r.url)?.kind));
  say(`### References that are not images (${bad.length})`);
  say();
  if (bad.length) {
    say(`| product | role | what it returned | url |`);
    say(`| --- | --- | --- | --- |`);
    for (const r of bad.slice(0, 200)) {
      const v = byUrl.get(r.url);
      say(
        `| ${String(r.product.title ?? r.product.slug)} \`${r.product.id}\` | \`${r.field}\`${r.index === null ? "" : `[${r.index}]`} | ` +
          `**${v?.kind}** ${v?.detail ?? ""} | \`${r.url.slice(0, 90)}\` |`,
      );
    }
    if (bad.length > 200) say(`| … | | | ${bad.length - 200} more |`);
  }
  say();

  /* ---- one asset serving several roles ---- */
  say(`### The same image used for more than one role`);
  say();
  const perProduct = new Map();
  for (const ref of allRefs) {
    const v = byUrl.get(ref.url);
    if (v?.kind !== "image" || !v.hash) continue;
    if (!perProduct.has(ref.product.id)) perProduct.set(ref.product.id, new Map());
    const m = perProduct.get(ref.product.id);
    if (!m.has(v.hash)) m.set(v.hash, []);
    m.get(v.hash).push(`${ref.field}${ref.index === null ? "" : `[${ref.index}]`}`);
  }
  let dupes = 0;
  say(`| product | identical bytes in |`);
  say(`| --- | --- |`);
  for (const [id, m] of perProduct) {
    for (const [, fields] of m) {
      if (fields.length < 2) continue;
      dupes++;
      const p = live.get(id);
      say(`| ${String(p?.title ?? p?.slug ?? id)} \`${id}\` | ${fields.join(", ")} |`);
    }
  }
  if (!dupes) say(`| — | nothing repeated |`);
  say();
  say(`- Products storing one image under several roles: **${dupes}**`);
  say();
}

/* ---- role coverage ---- */

say(`## Role coverage`);
say();
say(`| product | ${ROLES.slice(0, 4).map(([f]) => f).join(" | ")} | banners | gallery |`);
say(`| --- | :-: | :-: | :-: | :-: | ---: | ---: |`);
for (const p of products) {
  const mark = (f) => (String(p[f] ?? "").trim() ? "•" : "—");
  const count = (f) => (Array.isArray(p[f]) ? p[f].length : 0);
  say(
    `| ${String(p.title ?? p.slug)} | ${ROLES.slice(0, 4).map(([f]) => mark(f)).join(" | ")} | ` +
      `${count("bannerImages")} | ${count("galleryImages")} |`,
  );
}
say();

writeFileSync("media-pricing-audit.md", lines.join("\n") + "\n");
process.exit(0);
