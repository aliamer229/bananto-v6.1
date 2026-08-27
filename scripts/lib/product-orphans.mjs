/**
 * The decisions behind `scripts/repair-products.mjs`, with no I/O.
 *
 * Separated so the dangerous part — working out which rows are *provably*
 * orphaned — can be tested without a database. Getting this wrong in one
 * direction leaves the bug in place; getting it wrong in the other deletes live
 * products. See `scripts/product-orphans.test.mjs`.
 */

/** Strips ANSI colour codes so wrangler's warnings do not corrupt parsing. */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\[[0-9;]*m/g, "");
}

/**
 * Pulls the result rows out of `wrangler d1 execute --json` output.
 *
 * Wrangler prints warnings (proxy notices, version nags) around the JSON, and
 * those warnings contain `[` characters of their own — so "find the first
 * bracket" reads a colour code as the start of the payload. This scans for a
 * bracket that actually begins parseable JSON instead.
 */
export function parseWranglerJson(stdout) {
  const text = stripAnsi(stdout);
  for (let i = text.indexOf("["); i !== -1; i = text.indexOf("[", i + 1)) {
    const candidate = text.slice(i).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed[0]?.results ?? [];
    } catch {
      // Not the payload — keep looking.
    }
  }
  return [];
}

/**
 * The live product ids, reconstructed with the same merge rule the app uses.
 *
 * `src/lib/db.server.ts` loads the chunked aggregate and then **overlays**
 * `store:product:<id>` rows on top of it: a granular row replaces or adds a
 * product, and a row carrying `_deleted: true` removes it. Anything that
 * disagrees with that rule here would classify a live product as an orphan.
 *
 * A granular row that will not parse is treated as *live*, deliberately: an
 * unreadable row might be a real product, and the cost of being wrong is
 * deleting one.
 */
export function reconstructLiveIds(aggregateRows, granularRows) {
  const ids = new Set();

  const parts = [...aggregateRows]
    .map((r) => ({ key: String(r.key), value: String(r.value ?? "") }))
    .filter((r) => r.value.trim())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => r.value);

  const joined = parts.join("");
  if (joined.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(joined);
    } catch {
      throw new Error(
        "The aggregate catalogue did not parse. Refusing to judge anything orphaned against an unreadable catalogue.",
      );
    }
    for (const product of parsed) {
      if (product?.id) ids.add(String(product.id));
    }
  }

  const tombstones = new Set();
  for (const row of granularRows) {
    const key = String(row.key ?? "");
    const id = key.slice("store:product:".length);
    if (!id) continue;
    let parsed;
    try {
      parsed = JSON.parse(String(row.value ?? ""));
    } catch {
      ids.add(id);
      continue;
    }
    if (parsed?._deleted) tombstones.add(id);
    else if (parsed?.id) ids.add(String(parsed.id));
  }

  // A tombstone is the app's own "this product is deleted" marker, so it wins
  // over the aggregate exactly as it does at read time.
  for (const id of tombstones) ids.delete(id);

  return { ids, tombstones };
}

/** Escapes a value for a single-quoted SQL literal. */
export const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** Tables keyed by product id that a delete is supposed to clear. */
export const RELATION_TABLES = [
  ["game_records", "game_id"],
  ["game_variants", "game_id"],
  ["game_images", "game_id"],
  ["game_aliases", "game_id"],
  ["game_price_history", "game_id"],
  ["game_import_logs", "game_id"],
  ["game_device_performance", "game_id"],
  ["game_catalog", "id"],
];

/**
 * Turns the readings into statements. Pure — it writes nothing.
 *
 * `findings` is `{ liveIds, tombstones, identities, relations }`, where
 * `relations` maps `table -> string[]` of product ids present in that table.
 */
export function planRepairs({ liveIds, tombstones, identities = [], relations = {} }) {
  if (!(liveIds instanceof Set) || liveIds.size === 0) {
    throw new Error(
      "Refusing to plan against an empty catalogue — every row in the database would look orphaned.",
    );
  }

  const plan = [];
  const summary = { identities: [], relations: [], tombstones: [] };

  for (const row of identities) {
    const productId = String(row.product_id ?? row.productId ?? "");
    if (!productId || liveIds.has(productId)) continue;
    summary.identities.push({ productId, title: row.title ?? "" });
    plan.push(`DELETE FROM product_identity WHERE product_id = ${lit(productId)}`);
  }

  for (const [table, column] of RELATION_TABLES) {
    const rows = relations[table];
    if (!Array.isArray(rows)) continue;
    for (const raw of rows) {
      const id = String(raw ?? "");
      if (!id || liveIds.has(id)) continue;
      summary.relations.push({ table, productId: id });
      if (table === "game_device_performance") {
        // Child rows first, or the modes table keeps rows pointing at nothing.
        plan.push(
          `DELETE FROM game_device_performance_modes WHERE performance_id IN ` +
            `(SELECT id FROM game_device_performance WHERE game_id = ${lit(id)})`,
        );
      }
      plan.push(`DELETE FROM ${table} WHERE ${column} = ${lit(id)}`);
    }
  }

  /*
    A tombstone whose product is gone from the aggregate too has done its job.
    Removing it is safe *only* under that condition — while the aggregate still
    lists the product, the tombstone is the one thing hiding it.
  */
  for (const id of tombstones ?? []) {
    if (liveIds.has(id)) continue;
    summary.tombstones.push(id);
    plan.push(`DELETE FROM store_kv WHERE key = ${lit(`store:product:${id}`)}`);
  }

  return { plan, summary };
}
