#!/usr/bin/env node
/**
 * Turns a version-id prefix into the full id, and prints it.
 *
 * READ ONLY. Every report in this repository shows version ids truncated to
 * eight characters because a full UUID makes a table unreadable — and then a
 * rollback typed from one of those tables fails, because
 * `wrangler versions deploy` needs the whole id. That happened during a live
 * incident, which is the worst moment to discover it.
 *
 * So the prefix is resolved here rather than by a human copying a UUID. An
 * ambiguous prefix is refused rather than guessed: rolling production onto the
 * wrong version is worse than rolling onto none.
 */

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT_NAME = process.env.WORKER_NAME || "pixel-cart-cloud";
const prefix = String(process.argv[2] ?? "").trim();

if (!ACCOUNT || !TOKEN) throw new Error("missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
if (!prefix) throw new Error("usage: resolve-worker-version.mjs <version-id-or-prefix>");

const api = async (path) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    // A failed read is never "no match" — that conflation is how a rollback ends
    // up pointed at nothing while looking like it merely found no candidate.
    throw new Error(`could not read ${path}: HTTP ${res.status}`);
  }
  return body?.result;
};

const base = `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME}`;

/*
  Both sources, because the one a person reads an id from is not the one that
  lists it for long. `/versions` returns only the most recent page, and the
  version worth rolling back to is by definition an older one — during the
  first real incident, the target had already aged out of it. The deployments
  list is where the id was read from in the first place, and it keeps the id of
  whatever each deployment served.
*/
const ids = new Set();
for (const v of (await api(`${base}/versions`))?.items ?? []) {
  if (v?.id) ids.add(String(v.id));
}
for (const d of (await api(`${base}/deployments`))?.deployments ?? []) {
  for (const v of d?.versions ?? []) if (v?.version_id) ids.add(String(v.version_id));
}

if (!ids.size) throw new Error("both lists came back empty — refusing to resolve");

const matches = [...ids].filter((id) => id.startsWith(prefix)).map((id) => ({ id }));
if (matches.length === 0) {
  throw new Error(
    `no version starts with "${prefix}" among the ${ids.size} known to the versions and deployments lists`,
  );
}
if (matches.length > 1) {
  throw new Error(
    `"${prefix}" matches ${matches.length} versions (${matches.map((v) => v.id).join(", ")}) — give more characters`,
  );
}

process.stdout.write(String(matches[0].id));
