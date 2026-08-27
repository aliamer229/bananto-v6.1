/**
 * Where a product actually exists, and which of those places disagree.
 *
 * A product is stored in more than one place by design — the chunked aggregate,
 * the granular `store:product:<id>` rows that override it, an identity claim,
 * and a set of relational tables. When a write only reaches some of them the
 * result is a product that is deleted and still on the storefront, or gone from
 * the storefront and still refusing its own title to a replacement.
 *
 * Nothing here writes. It is the shared reader behind two callers:
 *
 * - `GET /api/admin/products/diagnose` — one product, for answering "why is
 *   this still showing?" against real production data.
 * - `scripts/repair-products.mjs` — the sweep, which uses these findings to
 *   decide what is *provably* orphaned.
 */
import { d1All, d1First, d1Ready } from "./d1.server";
import { getCatalogVersion, getStore } from "./db.server";
import { isProductHidden, isVisibleToPublic } from "./purchasable";
import { normalizeProductPlatform, normalizeProductTitle } from "./product-identity";
import type { Product } from "./types";

/** Every semantic media role, and whether this product has one. */
export interface MediaRoleReport {
  squareCardImage: string | null;
  frontBoxCover: string | null;
  coverImage: string | null;
  textureSource: string | null;
  bannerCount: number;
  galleryCount: number;
}

export interface ProductConsistencyReport {
  query: string;
  found: boolean;
  id: string | null;
  slug: string | null;
  title: string | null;

  /** Present in the merged catalogue `getStore()` returns. */
  inAggregate: boolean;
  /** A `store:product:<id>` row exists. */
  hasGranularRow: boolean;
  /** That row is a `_deleted` tombstone rather than a product. */
  granularIsTombstone: boolean;
  /** A `product_identity` row claims a title for this product id. */
  hasIdentityRow: boolean;
  /** An identity row holds this product's title but names a *different* id. */
  identityHeldByOtherProduct: string | null;
  /** Rows in relational tables that outlive a deleted product. */
  orphanRelations: { table: string; rows: number }[];

  hidden: boolean;
  visibleToPublic: boolean;
  /** Would appear in the public listing right now. */
  inPublicListing: boolean;

  media: MediaRoleReport | null;
  catalogVersion: number;

  /** Plain-language problems, in the order worth acting on. */
  problems: string[];
}

/** Relational tables keyed by product id that a delete is supposed to clear. */
const RELATION_TABLES = [
  { table: "game_records", column: "game_id" },
  { table: "game_variants", column: "game_id" },
  { table: "game_images", column: "game_id" },
  { table: "game_aliases", column: "game_id" },
  { table: "game_price_history", column: "game_id" },
  { table: "game_import_logs", column: "game_id" },
  { table: "game_device_performance", column: "game_id" },
] as const;

function first(product: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = product[field];
    if (typeof value === "string" && value.trim().length > 2) return value.trim();
  }
  return null;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function mediaFor(product: Record<string, unknown>): MediaRoleReport {
  return {
    squareCardImage: first(product, [
      "nintendoCardImage",
      "nintendo_card_image",
      "squareGameImage",
      "squareImage",
    ]),
    frontBoxCover: first(product, ["cartridgeImage", "cartridge_image", "front_image", "box_front_url"]),
    coverImage: first(product, ["coverImage", "cover_image", "coverUrl"]),
    textureSource: first(product, ["coverHiResImage", "coverHiRes", "textureSourceImage"]),
    bannerCount:
      count(product["bannerImages"]) + (first(product, ["bannerImage", "banner"]) ? 1 : 0),
    galleryCount: count(product["galleryImages"]) + count(product["gallery"]),
  };
}

/** Rows in a table for this product id. `null` when the table does not exist. */
async function relationRows(table: string, column: string, id: string): Promise<number | null> {
  try {
    const row = await d1First<{ n: number }>(
      `SELECT COUNT(*) as n FROM ${table} WHERE ${column} = ?`,
      id,
    );
    return Number(row?.n ?? 0);
  } catch {
    // Table absent on this deployment — not a finding.
    return null;
  }
}

/**
 * Inspects one product by id or slug and reports every representation of it.
 *
 * Accepts a product that is *not* in the catalogue: that is the interesting
 * case, because the leftovers are what a "deleted" product leaves behind.
 */
export async function inspectProductConsistency(
  query: string,
): Promise<ProductConsistencyReport> {
  const needle = String(query || "").trim();
  const store = await getStore();
  const products = (store.products || []) as Product[];

  const match =
    products.find((p) => String(p?.id) === needle) ??
    products.find((p) => String(p?.slug || "").toLowerCase() === needle.toLowerCase());

  const id = match ? String(match.id) : needle;
  const slug = match?.slug ? String(match.slug) : null;
  const title = match ? String(match.titleEn || match.title || "") : null;

  const report: ProductConsistencyReport = {
    query: needle,
    found: Boolean(match),
    id: match ? id : null,
    slug,
    title,
    inAggregate: Boolean(match),
    hasGranularRow: false,
    granularIsTombstone: false,
    hasIdentityRow: false,
    identityHeldByOtherProduct: null,
    orphanRelations: [],
    hidden: match ? isProductHidden(match) : false,
    visibleToPublic: match ? isVisibleToPublic(match) : false,
    inPublicListing: false,
    media: match ? mediaFor(match as unknown as Record<string, unknown>) : null,
    catalogVersion: await getCatalogVersion(),
    problems: [],
  };

  report.inPublicListing = products.filter((p) => isVisibleToPublic(p)).some((p) => String(p?.id) === id);

  if (!(await d1Ready())) {
    report.problems.push("D1 is not bound here — only the in-memory catalogue could be checked.");
    return report;
  }

  // The granular row that overrides the aggregate.
  try {
    const row = await d1First<{ value: string }>(
      `SELECT value FROM store_kv WHERE key = ?`,
      `store:product:${id}`,
    );
    if (row?.value) {
      report.hasGranularRow = true;
      try {
        report.granularIsTombstone = Boolean(JSON.parse(row.value)?._deleted);
      } catch {
        report.problems.push("The store:product row exists but does not parse as JSON.");
      }
    }
  } catch {
    report.problems.push("Could not read store_kv.");
  }

  // The identity claim.
  try {
    const own = await d1First<{ product_id: string }>(
      `SELECT product_id FROM product_identity WHERE product_id = ?`,
      id,
    );
    report.hasIdentityRow = Boolean(own?.product_id);

    if (title) {
      const holder = await d1First<{ product_id: string }>(
        `SELECT product_id FROM product_identity WHERE normalized_title = ? AND platform = ?`,
        normalizeProductTitle(title),
        normalizeProductPlatform((match as Record<string, unknown> | undefined)?.["platform"]),
      );
      if (holder?.product_id && holder.product_id !== id) {
        report.identityHeldByOtherProduct = holder.product_id;
      }
    }
  } catch {
    report.problems.push("Could not read product_identity.");
  }

  // Relational leftovers.
  for (const { table, column } of RELATION_TABLES) {
    const rows = await relationRows(table, column, id);
    if (rows && rows > 0) report.orphanRelations.push({ table, rows });
  }

  /* ---- Turn the readings into problems worth acting on ---- */

  if (!report.found) {
    if (report.hasGranularRow && !report.granularIsTombstone) {
      report.problems.push(
        "A store:product row exists for a product that is not in the catalogue. It will be merged back in on the next read.",
      );
    }
    if (report.hasIdentityRow) {
      report.problems.push(
        "An identity row survives a product that no longer exists. It will refuse this title to any new product.",
      );
    }
    if (report.orphanRelations.length) {
      report.problems.push(
        `Relational rows survive a deleted product: ${report.orphanRelations
          .map((r) => `${r.table}(${r.rows})`)
          .join(", ")}.`,
      );
    }
    if (!report.problems.length) {
      report.problems.push("Not found anywhere — nothing to clean up.");
    }
    return report;
  }

  if (report.granularIsTombstone) {
    report.problems.push(
      "The product is in the aggregate but its store:product row is a delete tombstone. The two disagree.",
    );
  }
  if (report.identityHeldByOtherProduct) {
    report.problems.push(
      `Its title is claimed in product_identity by a different product id (${report.identityHeldByOtherProduct}).`,
    );
  }
  if (!report.hasIdentityRow) {
    report.problems.push(
      "No identity row — duplicate prevention is not protecting this product's title.",
    );
  }
  if (report.hidden && report.inPublicListing) {
    report.problems.push("Marked hidden but still present in the public listing.");
  }
  if (report.media && !report.media.frontBoxCover) {
    report.problems.push("No Front Box Cover: listings and the 3D fallback will show a placeholder.");
  }
  if (report.media && !report.media.squareCardImage) {
    report.problems.push("No Square Card Image: the homepage Switch strip will show a placeholder.");
  }

  return report;
}

/** Identity rows whose product is not in the catalogue. Read-only. */
export async function listOrphanIdentities(): Promise<
  { productId: string; title: string; normalizedTitle: string; platform: string }[]
> {
  if (!(await d1Ready())) return [];
  const store = await getStore();
  const live = new Set(((store.products || []) as Product[]).map((p) => String(p?.id)));
  /*
    An empty catalogue is far more likely a failed read than a store with no
    products, and every identity row would look orphaned against it.
  */
  if (live.size === 0) return [];

  const rows = await d1All<{
    product_id: string;
    title: string | null;
    normalized_title: string;
    platform: string;
  }>(`SELECT product_id, title, normalized_title, platform FROM product_identity`);

  return rows
    .filter((row) => !live.has(String(row.product_id)))
    .map((row) => ({
      productId: String(row.product_id),
      title: row.title ?? "",
      normalizedTitle: row.normalized_title,
      platform: row.platform,
    }));
}

/** `store:product:<id>` rows that are neither tombstones nor in the catalogue. */
export async function listOrphanGranularRows(): Promise<{ key: string; productId: string }[]> {
  if (!(await d1Ready())) return [];
  const store = await getStore();
  const live = new Set(((store.products || []) as Product[]).map((p) => String(p?.id)));
  if (live.size === 0) return [];

  const rows = await d1All<{ key: string; value: string }>(
    `SELECT key, value FROM store_kv WHERE key LIKE 'store:product:%'`,
  );

  const orphans: { key: string; productId: string }[] = [];
  for (const row of rows) {
    const productId = row.key.slice("store:product:".length);
    if (!productId || live.has(productId)) continue;
    let tombstone = false;
    try {
      tombstone = Boolean(JSON.parse(row.value)?._deleted);
    } catch {
      // Unparseable rows are reported so a human decides, never auto-removed.
      continue;
    }
    // A tombstone for a product that is gone has done its job and is redundant,
    // but removing it is only safe once the aggregate no longer holds it — which
    // is exactly the condition tested above.
    orphans.push({ key: row.key, productId: tombstone ? `${productId} (tombstone)` : productId });
  }
  return orphans;
}
