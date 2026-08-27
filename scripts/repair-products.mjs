#!/usr/bin/env node
/**
 * Finds and clears rows that outlived the product they belong to.
 *
 * ## Why this exists
 *
 * Deletes used to only half-happen. The route the admin UI called removed a
 * product's relational rows and wrote a `_deleted` tombstone in the same
 * `Promise.allSettled` that deleted that tombstone, and never touched the
 * aggregate catalogue at all. The code path is fixed, but the rows those
 * deletes left behind are still in production D1 — and the identity rows among
 * them are actively harmful: each one refuses its title to any new product,
 * naming a `conflictProductId` an admin cannot find anywhere.
 *
 * The session that wrote this had no Cloudflare access, so **nothing here has
 * been run against real data**. It shells out to `wrangler`, using your
 * credentials, on your machine.
 *
 * ## Safety
 *
 * - **Dry run by default.** `--apply` is required to write anything.
 * - **Idempotent.** A second run finds nothing and changes nothing.
 * - **Only provable orphans.** A row is a candidate solely when its product id
 *   is absent from the live catalogue, reconstructed with exactly the merge
 *   rule `src/lib/db.server.ts` uses. Unparseable rows count as live.
 * - **Refuses an empty catalogue**, which is far more likely a failed query
 *   than a store with no products.
 * - **Never touches products, reviews, orders or wallet history.**
 *
 * The decisions live in `scripts/lib/product-orphans.mjs` and are unit-tested
 * in `scripts/product-orphans.test.mjs`; this file is the I/O around them.
 *
 * ## Usage
 *
 *   npm run repair:products -- --dry-run            # local D1
 *   npm run repair:products -- --dry-run --remote   # production D1
 *   npm run repair:products -- --apply --remote     # actually clean up
 */

import { execFileSync } from "node:child_process";

import {
  parseWranglerJson,
  planRepairs,
  reconstructLiveIds,
  RELATION_TABLES,
  stripAnsi,
} from "./lib/product-orphans.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const REMOTE = args.includes("--remote");
const DB = "bananto";

if (APPLY && args.includes("--dry-run")) {
  console.error("Pass either --dry-run or --apply, not both.");
  process.exit(2);
}

class MissingTable extends Error {}

/** Runs one statement through wrangler and returns its rows. */
function sql(statement) {
  const argv = [
    "wrangler",
    "d1",
    "execute",
    DB,
    REMOTE ? "--remote" : "--local",
    "--json",
    "--command",
    statement,
  ];
  let out;
  try {
    out = execFileSync("npx", argv, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const detail = stripAnsi((err.stderr || err.stdout || err.message || "").toString()).trim();
    if (/no such table/i.test(detail)) throw new MissingTable(detail);
    throw new Error(`wrangler failed running:\n  ${statement}\n\n${detail}`);
  }
  return parseWranglerJson(out);
}

function main() {
  console.log(`\nProduct repair — ${REMOTE ? "REMOTE (production)" : "local"} D1 "${DB}"`);
  console.log(APPLY ? "Mode: APPLY (will delete)\n" : "Mode: DRY RUN (nothing will be written)\n");

  const aggregateRows = sql(
    `SELECT key, value FROM store_kv WHERE key = 'store:products' OR key LIKE 'store:products#%'`,
  );
  const granularRows = sql(`SELECT key, value FROM store_kv WHERE key LIKE 'store:product:%'`);

  const { ids: liveIds, tombstones } = reconstructLiveIds(aggregateRows, granularRows);
  console.log(`Live products     : ${liveIds.size}`);
  console.log(`Delete tombstones : ${tombstones.size}`);

  if (liveIds.size === 0) {
    console.error(
      "\nRefusing to continue: the catalogue read back empty.\n" +
        "That is far more likely a failed query than a store with no products,\n" +
        "and every row in the database would look orphaned against it.",
    );
    process.exit(1);
  }

  let identities = [];
  try {
    identities = sql(`SELECT product_id, title FROM product_identity`);
  } catch (err) {
    if (!(err instanceof MissingTable)) throw err;
    console.log("product_identity: not present on this database — skipped");
  }

  const relations = {};
  for (const [table, column] of RELATION_TABLES) {
    try {
      relations[table] = sql(`SELECT DISTINCT ${column} AS id FROM ${table}`).map((r) =>
        String(r.id ?? ""),
      );
    } catch (err) {
      if (!(err instanceof MissingTable)) throw err;
      console.log(`${table}: not present on this database — skipped`);
    }
  }

  const { plan, summary } = planRepairs({ liveIds, tombstones, identities, relations });

  console.log(`\nOrphaned identity rows : ${summary.identities.length}`);
  for (const row of summary.identities) {
    console.log(`  · ${row.productId}  "${row.title}"  — refuses this title to new products`);
  }

  console.log(`Orphaned relational rows: ${summary.relations.length}`);
  for (const row of summary.relations) console.log(`  · ${row.table}  ${row.productId}`);

  console.log(`Spent tombstones        : ${summary.tombstones.length}`);
  for (const id of summary.tombstones) console.log(`  · store:product:${id}`);

  console.log(`\n${"─".repeat(60)}`);
  if (plan.length === 0) {
    console.log("Nothing to repair. The catalogue and its indexes agree.\n");
    return;
  }

  console.log(`${plan.length} statement(s) planned.\n`);
  if (!APPLY) {
    for (const statement of plan) console.log(`  ${statement};`);
    console.log(
      `\nDry run — nothing was written.\n` +
        `Re-run with --apply${REMOTE ? " --remote" : ""} to execute.\n`,
    );
    return;
  }

  let done = 0;
  for (const statement of plan) {
    try {
      sql(statement);
      done += 1;
    } catch (err) {
      console.error(`  FAILED: ${statement}\n    ${err.message}`);
    }
  }
  console.log(`\nApplied ${done}/${plan.length} statement(s).`);
  console.log("Re-run with --dry-run to confirm nothing is left.\n");
}

try {
  main();
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(1);
}
