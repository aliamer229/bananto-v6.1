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
