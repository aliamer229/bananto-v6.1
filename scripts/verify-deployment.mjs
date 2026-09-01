#!/usr/bin/env node
/**
 * Does the site that is actually serving traffic work?
 *
 * READ ONLY, and deliberately outside-in: it asks the public hostname over
 * HTTPS rather than the Worker it just uploaded, because "wrangler reported
 * success" and "banan.to answers correctly" are different claims and only the
 * second one is the deployment.
 *
 * Exits non-zero when the site is unreachable, unhealthy, or serving a
 * catastrophic error page, so a deploy job fails loudly instead of finishing
 * green over a broken site.
 */

import { writeFileSync } from "node:fs";

const ORIGIN = (process.env.VERIFY_ORIGIN || "https://banan.to").replace(/\/+$/, "");
/** Cloudflare needs a moment to roll a new version out to every colo. */
const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS || 5);
const GAP_MS = Number(process.env.VERIFY_GAP_MS || 6000);

const lines = [];
const say = (text = "") => {
  lines.push(text);
  console.log(text);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One attempt at the health endpoint.
 *
 * A network failure and an unhealthy answer are reported differently: the first
 * is worth retrying, the second is the site telling us something specific.
 */
async function probeHealth() {
  try {
    const res = await fetch(`${ORIGIN}/api/health`, {
      headers: { "user-agent": "bananto-deploy-verify" },
      redirect: "follow",
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, why: `not JSON: ${text.slice(0, 120)}` };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, why: String(error?.message || error) };
  }
}

say(`# Deployment verification`);
say();
say(`Run at ${new Date().toISOString()} against \`${ORIGIN}\`.`);
say();

let health = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  health = await probeHealth();
  if (health.ok && health.body?.status === "OK") break;
  const detail = health.why ?? `status ${health.body?.status ?? "?"}`;
  say(`- attempt ${attempt}/${ATTEMPTS}: HTTP ${health.status} — ${detail}`);
  if (attempt < ATTEMPTS) await sleep(GAP_MS);
}

const body = health?.body ?? {};
say();
say(`- \`/api/health\` → HTTP ${health?.status ?? 0}, status **${body.status ?? "unreachable"}**`);
/*
  The endpoint answers a flat object: `status`, `d1`, `r2`, `productsRead`,
  `productsCount`. Read exactly those rather than guessing at a nested shape — a
  wrong key reads as "—" and would make a broken deploy look merely quiet.
*/
if (body.d1 !== undefined || body.productsRead !== undefined) {
  say(`- D1: ${body.d1 ?? "—"} (${body.d1LatencyMs ?? "—"} ms)`);
  say(
    `- products read: ${body.productsRead ?? "—"} · count **${body.productsCount ?? "—"}** (${body.productsLatencyMs ?? "—"} ms)`,
  );
  say(`- R2: ${body.r2 ?? "—"}`);
} else {
  say(`- raw: \`${JSON.stringify(body).slice(0, 400)}\``);
}

/*
  Public pages are checked separately from the API. A Worker can answer
  `/api/health` perfectly while an omitted file route serves the application's
  own 404 page. Policy and wallet are linked from the storefront and therefore
  form part of the release gate, not a manual post-deploy check.
*/
const PAGE_PATHS = (process.env.VERIFY_PATHS || "/,/policy,/wallet")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
let pagesOk = true;
for (const path of PAGE_PATHS) {
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      headers: { "user-agent": "bananto-deploy-verify" },
      redirect: "follow",
    });
    const text = await res.text();
    const application404 =
      /<h1[^>]*>\s*404\s*<\/h1>|Page not found|Page you're looking for doesn't exist/i.test(text);
    let pageOk = res.ok && !application404 && !/حدث خطأ غير متوقع|Internal Server Error/i.test(text);
    // A challenge page is the edge protecting the site, not the site being broken.
    if (res.status === 403) pageOk = true;
    pagesOk = pagesOk && pageOk;
    say(
      `- \`${path}\` → HTTP ${res.status}, ${text.length} bytes${
        res.status === 403
          ? " (bot protection — not a deploy failure)"
          : application404
            ? " (application 404)"
            : ""
      }`,
    );
  } catch (error) {
    pagesOk = false;
    say(`- \`${path}\` → unreachable: ${String(error?.message || error)}`);
  }
}

const healthy = health?.ok === true && body.status === "OK";
say();
say(healthy && pagesOk ? `**verified: the deployed site is healthy**` : `**FAILED**`);

writeFileSync("deployment-verification.md", lines.join("\n") + "\n");

if (!healthy || !pagesOk) {
  console.error("deployment verification failed");
  process.exit(1);
}
