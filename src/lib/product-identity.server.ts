/**
 * The atomic half of duplicate prevention.
 *
 * The catalogue is a JSON document, so the API's "is this title already taken?"
 * check is a read followed by a write with a gap in between — two admins
 * pressing save at the same moment both read a clean catalogue and both write.
 * `product_identity` closes that gap: one row per product, unique on
 * (normalized_title, platform), so the second writer loses on the constraint
 * rather than on timing.
 *
 * Nothing here deletes a product. Releasing a claim removes only the index row.
 */
import { d1All, d1First, d1Ready, d1Run } from "./d1.server";
import {
  normalizeProductPlatform,
  normalizeProductTitle,
  productIdentityKeys,
  type ProductIdentityInput,
} from "./product-identity";

export interface IdentityClaim {
  ok: boolean;
  /** The product already holding this identity, when the claim failed. */
  conflictProductId?: string;
  conflictTitle?: string;
}

/**
 * Take the identity for a product, or report who already has it.
 *
 * Idempotent for the same product: re-saving it just refreshes its own row.
 */
export async function claimProductIdentity(
  product: ProductIdentityInput,
  now = new Date().toISOString(),
): Promise<IdentityClaim> {
  const productId = String(product.id ?? "").trim();
  const normalizedTitle = normalizeProductTitle(product.title ?? product.titleEn);
  const platform = normalizeProductPlatform(product.platform);

  // Nothing to enforce for a product with no usable title; the API rejects
  // those on their own terms.
  if (!productId || !normalizedTitle) return { ok: true };
  if (!(await d1Ready())) return { ok: true };

  try {
    const existing = await d1First<{ product_id: string; title: string | null }>(
      `SELECT product_id, title FROM product_identity
       WHERE normalized_title = ? AND platform = ?`,
      normalizedTitle,
      platform,
    );
    if (existing && existing.product_id !== productId) {
      return {
        ok: false,
        conflictProductId: existing.product_id,
        ...(existing.title ? { conflictTitle: existing.title } : {}),
      };
    }

    await d1Run(
      `INSERT INTO product_identity (product_id, normalized_title, platform, title, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         normalized_title = excluded.normalized_title,
         platform = excluded.platform,
         title = excluded.title,
         updated_at = excluded.updated_at`,
      productId,
      normalizedTitle,
      platform,
      String(product.title ?? product.titleEn ?? ""),
      now,
    );
    return { ok: true };
  } catch (err) {
    /*
      The unique index is the last line of defence, and losing the race here
      means somebody else took the identity between the SELECT and the INSERT.
      That is a conflict, not a server error.
    */
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|constraint/i.test(message)) {
      const winner = await d1First<{ product_id: string; title: string | null }>(
        `SELECT product_id, title FROM product_identity
         WHERE normalized_title = ? AND platform = ?`,
        normalizedTitle,
        platform,
      ).catch(() => null);
      return {
        ok: false,
        ...(winner?.product_id ? { conflictProductId: winner.product_id } : {}),
        ...(winner?.title ? { conflictTitle: winner.title } : {}),
      };
    }
    // A broken index must not stop an admin saving a product; the API's own
    // catalogue check still applies.
    console.warn("[product-identity:claim_failed]", { productId }, err);
    return { ok: true };
  }
}

/** Drop a product's index row. Used when the product itself is deleted. */
export async function releaseProductIdentity(productId: string): Promise<void> {
  if (!productId || !(await d1Ready())) return;
  try {
    await d1Run(`DELETE FROM product_identity WHERE product_id = ?`, productId);
  } catch (err) {
    console.warn("[product-identity:release_failed]", { productId }, err);
  }
}

/** Drop any index row holding a title+platform if it's not held by an active product. */
export async function releaseProductIdentityByKey(
  normalizedTitle: string,
  platform: string,
): Promise<void> {
  if (!normalizedTitle || !(await d1Ready())) return;
  try {
    await d1Run(
      `DELETE FROM product_identity WHERE normalized_title = ? AND platform = ?`,
      normalizedTitle,
      platform,
    );
  } catch (err) {
    console.warn("[product-identity:release_by_key_failed]", { normalizedTitle, platform }, err);
  }
}

/** Hard delete all related records across all tables for a deleted product */
export async function hardDeleteProductRelations(productId: string): Promise<void> {
  if (!productId || !(await d1Ready())) return;
  try {
    await Promise.allSettled([
      d1Run(`DELETE FROM product_identity WHERE product_id = ?`, productId),
      d1Run(`DELETE FROM game_catalog WHERE id = ? OR game_id = ?`, productId, productId),
      d1Run(`DELETE FROM game_records WHERE game_id = ?`, productId),
      d1Run(
        `DELETE FROM game_device_performance_modes WHERE performance_id IN (SELECT id FROM game_device_performance WHERE game_id = ?)`,
        productId,
      ),
      d1Run(`DELETE FROM game_device_performance WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM game_variants WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM game_images WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM game_aliases WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM game_price_history WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM game_import_logs WHERE game_id = ?`, productId),
      d1Run(`DELETE FROM store_kv WHERE key = ?`, `store:product:${productId}`),
    ]);
  } catch (err) {
    console.warn("[product-relations:hard_delete_failed]", { productId }, err);
  }
}

/** Ids of the products actually in the catalogue right now. */
function catalogueIds(catalogue: readonly ProductIdentityInput[]): Set<string> {
  const ids = new Set<string>();
  for (const product of catalogue) {
    const id = product?.id === undefined || product?.id === null ? "" : String(product.id);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Claim an identity, refusing only to a product that still exists.
 *
 * A row here outlives its product if the product was deleted without releasing
 * it, and that stale row then refuses the identity to everything — forever,
 * naming a `conflictProductId` an admin cannot find anywhere in the catalogue.
 * Deletion now releases the row, but the rows already orphaned by earlier
 * deletions still have to go, so a conflict is verified against the live
 * catalogue before it is believed: if the holder is gone, its row is dropped
 * and the claim retried once.
 *
 * A conflict with a product that *is* in the catalogue is returned unchanged.
 * This never weakens duplicate prevention; it only stops a ghost enforcing it.
 */
export async function claimProductIdentityAgainstCatalogue(
  product: ProductIdentityInput,
  catalogue: readonly ProductIdentityInput[],
  now = new Date().toISOString(),
): Promise<IdentityClaim> {
  const claim = await claimProductIdentity(product, now);
  if (claim.ok) return claim;

  const activeIds = catalogueIds(catalogue);
  const normalizedTitle = normalizeProductTitle(product.title ?? product.titleEn);
  const platform = normalizeProductPlatform(product.platform);

  // If the conflict product ID is not in the live catalogue, release it
  if (claim.conflictProductId && !activeIds.has(claim.conflictProductId)) {
    console.warn("[product-identity:orphan_released]", {
      productId: String(product.id ?? ""),
      orphanProductId: claim.conflictProductId,
    });
    await releaseProductIdentity(claim.conflictProductId);
    return claimProductIdentity(product, now);
  }

  // If conflict happened without a conflictProductId or with another ghost row:
  if (!claim.conflictProductId && normalizedTitle) {
    const existing = await d1First<{ product_id: string }>(
      `SELECT product_id FROM product_identity WHERE normalized_title = ? AND platform = ?`,
      normalizedTitle,
      platform,
    ).catch(() => null);

    if (existing?.product_id && !activeIds.has(existing.product_id)) {
      await releaseProductIdentity(existing.product_id);
      return claimProductIdentity(product, now);
    }
  }

  return claim;
}

/**
 * Drop every index row whose product is no longer in the catalogue.
 *
 * The lazy repair above fixes a row the moment something needs its identity;
 * this is the sweep, for the diagnostics endpoint. Only rows pointing at a
 * product that does not exist are removed — nothing in the catalogue is
 * touched, and no product is ever deleted here.
 */
export async function pruneOrphanProductIdentities(
  catalogue: readonly ProductIdentityInput[],
): Promise<{ productId: string; title: string }[]> {
  if (!(await d1Ready())) return [];
  const live = catalogueIds(catalogue);
  /*
    An empty catalogue is far more likely a failed read than a store with no
    products, and the index is the only thing standing between the catalogue
    and duplicate rows. Sweeping on that reading would clear all of it.
  */
  if (live.size === 0) return [];
  const removed: { productId: string; title: string }[] = [];

  for (const row of await listProductIdentities()) {
    if (live.has(row.productId)) continue;
    await releaseProductIdentity(row.productId);
    removed.push({ productId: row.productId, title: row.title });
  }

  return removed;
}

/**
 * Bring the index up to date with the catalogue, without failing on the
 * duplicates already in it.
 *
 * Run before the constraint can mean anything: an existing catalogue may
 * already contain collisions, and the first product to claim each identity
 * simply wins the row. The losers are returned so they can be reported — and
 * they stay in the catalogue, untouched.
 */
export async function reindexProductIdentities(
  products: readonly ProductIdentityInput[],
  now = new Date().toISOString(),
): Promise<{ indexed: number; unindexed: { productId: string; title: string }[] }> {
  if (!(await d1Ready())) return { indexed: 0, unindexed: [] };

  let indexed = 0;
  const unindexed: { productId: string; title: string }[] = [];

  for (const product of products) {
    const productId = String(product.id ?? "").trim();
    if (!productId || productIdentityKeys(product).length === 0) continue;
    const claim = await claimProductIdentity(product, now);
    if (claim.ok) indexed += 1;
    else unindexed.push({ productId, title: String(product.title ?? product.titleEn ?? "") });
  }

  return { indexed, unindexed };
}

/** Every identity row, for diagnostics. */
export async function listProductIdentities(): Promise<
  { productId: string; normalizedTitle: string; platform: string; title: string }[]
> {
  if (!(await d1Ready())) return [];
  const rows = await d1All<{
    product_id: string;
    normalized_title: string;
    platform: string;
    title: string | null;
  }>(`SELECT product_id, normalized_title, platform, title FROM product_identity`);
  return rows.map((row) => ({
    productId: row.product_id,
    normalizedTitle: row.normalized_title,
    platform: row.platform,
    title: row.title ?? "",
  }));
}
