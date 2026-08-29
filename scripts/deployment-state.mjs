#!/usr/bin/env node
/**
 * What is actually running in production, asked of Cloudflare rather than guessed.
 *
 * READ ONLY. Queries the Workers API for this script's deployments and versions,
 * and reports the commit each was built from where Cloudflare records it.
 *
 * A branch being pushed is not a branch being served, and for most of this
 * repository's life deployment was a `wrangler deploy` typed on a laptop, so
 * the commit in production was not recorded anywhere the repository could read.
 * Reading Cloudflare's own deployment metadata is how that question gets an
 * answer rather than a guess. `.github/workflows/deploy.yml` now runs this
 * after every deploy for the same reason.
 */

import { writeFileSync } from "node:fs";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT_NAME = process.env.WORKER_NAME || "pixel-cart-cloud";
if (!ACCOUNT || !TOKEN) throw new Error("missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");

const SECRETS = [TOKEN, ACCOUNT].filter((v) => v && v.length >= 8);
const redact = (t) => SECRETS.reduce((s, x) => s.split(x).join("«redacted»"), String(t ?? ""));
const lines = [];
const say = (t = "") => {
  const safe = redact(t);
  lines.push(safe);
  console.log(safe);
};

const api = async (path) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  }
  return { ok: res.ok && body?.success !== false, status: res.status, body };
};

say(`# Deployment state — READ ONLY`);
say();
say(`Run at ${new Date().toISOString()}.`);
say();
say(`- worker script: \`${SCRIPT_NAME}\``);
say();

/* ---------------------------------------------------------------- workers */

const deployments = await api(`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME}/deployments`);
say(`## Worker deployments`);
say();
if (!deployments.ok) {
  say(
    `- could not read deployments: HTTP ${deployments.status} ${redact(JSON.stringify(deployments.body?.errors ?? deployments.error ?? ""))}`,
  );
} else {
  const items = deployments.body?.result?.deployments ?? [];
  say(`- deployments recorded: **${items.length}**`);
  say();
  say(`| created | author | source | versions |`);
  say(`| --- | --- | --- | --- |`);
  for (const d of items.slice(0, 10)) {
    const versions = (d.versions ?? [])
      .map((v) => `${v.version_id?.slice(0, 8)} @${v.percentage ?? 100}%`)
      .join(", ");
    say(
      `| ${d.created_on ?? "—"} | ${d.author_email ?? "—"} | ${d.source ?? "—"} | ${versions || "—"} |`,
    );
  }
}
say();

const versions = await api(`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME}/versions`);
say(`## Worker versions and the commit each was built from`);
say();
if (!versions.ok) {
  say(
    `- could not read versions: HTTP ${versions.status} ${redact(JSON.stringify(versions.body?.errors ?? versions.error ?? ""))}`,
  );
} else {
  const items = versions.body?.result?.items ?? [];
  say(`- versions recorded: **${items.length}**`);
  say();
  say(`| created | version | commit | branch | message |`);
  say(`| --- | --- | --- | --- | --- |`);
  for (const v of items.slice(0, 12)) {
    const a = v.annotations ?? {};
    say(
      `| ${v.created_on ?? "—"} | \`${String(v.id ?? "").slice(0, 8)}\` | \`${String(a["workers/triggered_by"] === "deployment" ? a["workers/message"] : (a["workers/tag"] ?? "")).slice(0, 40) || "—"}\` | ${a["workers/branch"] ?? "—"} | ${String(a["workers/message"] ?? "").slice(0, 60) || "—"} |`,
    );
  }
}
say();

/* ------------------------------------------------------ pages, if any */

const pages = await api(`/accounts/${ACCOUNT}/pages/projects`);
say(`## Pages projects`);
say();
if (!pages.ok) {
  say(`- could not read Pages projects: HTTP ${pages.status}`);
} else {
  const projects = pages.body?.result ?? [];
  if (!projects.length) say("- none");
  for (const p of projects) {
    say(
      `- \`${p.name}\` — production branch **${p.source?.config?.production_branch ?? "—"}**, last deploy ${p.latest_deployment?.created_on ?? "—"} from \`${p.latest_deployment?.deployment_trigger?.metadata?.branch ?? "—"}\` commit \`${String(p.latest_deployment?.deployment_trigger?.metadata?.commit_hash ?? "").slice(0, 8) || "—"}\``,
    );
  }
}
say();

/* ---------------------------------------------- what the live site serves */

say(`## What banan.to actually answers`);
say();
for (const url of ["https://banan.to/", "https://banan.to/api/health"]) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "bananto-deployment-check" } });
    const text = await res.text();
    say(
      `- \`${url}\` → HTTP ${res.status}, ${text.length} bytes, \`${res.headers.get("cf-ray") ? "served by Cloudflare" : "no cf-ray"}\``,
    );
    const build = text.match(/assets\/([a-zA-Z0-9_-]+)-([a-f0-9]{8,})\.js/);
    if (build) say(`  - build asset: \`${build[0]}\``);
    if (url.endsWith("/api/health")) say(`  - body: \`${text.slice(0, 200)}\``);
  } catch (err) {
    say(`- \`${url}\` → unreachable: ${String(err?.message ?? err).slice(0, 100)}`);
  }
}
say();

writeFileSync("deployment-state.md", lines.join("\n") + "\n");
