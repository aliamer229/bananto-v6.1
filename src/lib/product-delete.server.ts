/**
 * One owner for "delete this product", across every place a product exists.
 *
 * ## Why a product used to come back
 *
 * The catalogue is stored twice. `store:products` (plus `store:products#NNN`
 * chunks) holds the aggregate, and `store:product:<id>` rows hold individual
 * products written by the granular save path. On read, `loadStore` **overlays
 * the granular rows on top of the aggregate** — a granular row wins, and a
 * granular row carrying `_deleted: true` removes the product from the result.
 *
 * `persistStore` writes the aggregate and never touches granular rows. So the
 * two delete routes each got half of it:
 *
 * - `DELETE /api/admin/products?id=` (what the admin UI actually calls) wrote a
 *   `_deleted` tombstone and called `hardDeleteProductRelations` **in the same
 *   `Promise.allSettled`** — and that helper's own
 *   `DELETE FROM store_kv WHERE key = 'store:product:<id>'` deleted the
 *   tombstone that had just been written. The aggregate was never touched at
 *   all, so the next read put the product straight back. It then returned
 *   `success: true` without checking anything.
 * - `DELETE /api/admin/products/:id` removed the product from the aggregate but
 *   verified *before* clearing the granular row, so a product that had one
 *   failed verification with a 500 — and because that returned early, the
 *   identity row was never released, leaving a ghost that refused the title to
 *   any future product with no visible holder.
 *
 * ## The order that is correct at every instant
 *
 * 1. **Tombstone first.** From this moment every read excludes the product,
 *    whichever half of the store it lives in.
 * 2. **Remove it from the aggregate.** `updateStore` rewrites the chunks under
 *    the `store_rev` guard, so a concurrent save cannot resurrect it.
 * 3. **Then** drop the granular row, the identity claim and the relational
 *    rows. Safe now, because step 2 means the aggregate no longer holds it.
 *
 * At no point between steps is the product visible. If step 2 fails the
 * tombstone stays, so the product stays hidden rather than flickering back.
 *
 * ## What is deliberately kept
 *
 * Reviews, ratings, orders and wallet history are keyed by product id and are
 * **not** touched here — `hardDeleteProductRelations` only clears catalogue
 * rows. The identity row *is* released, which is what allows the same game to
 * be added again later.
 */
import { d1First, d1Ready, d1Run } from "./d1.server";
import { getStore, invalidateStoreCache, updateStore } from "./db.server";
import { deactivateGameDevicePerformance } from "./devicePerformance.server";
import { hardDeleteProductRelations } from "./product-identity.server";
import { isVisibleToPublic } from "./purchasable";
import type { Product } from "./types";

/** Every representation the verifier checks, named for the error message. */
export type ProductRepresentation =
  | "aggregate:id"
  | "aggregate:slug"
  | "store_kv:granular"
  | "d1:product_identity"
  | "public:listing";

export interface ProductDeleteResult {
  ok: boolean;
  id: string;
  slug: string | undefined;
  /** Representations that still hold the product. Empty when `ok`. */
  remaining: ProductRepresentation[];
  /** Set when the aggregate rewrite itself threw. */
  error?: string;
}

const granularKey = (productId: string) => `store:product:${productId}`;

/**
 * Which representations still contain this product.
 *
 * Read straight from D1 for the two row-level checks rather than through the
 * store cache, because the point of the exercise is to catch a row the cache
 * would have hidden.
 */
export async function findRemainingProductRepresentations(
  productId: string,
  slug?: string | undefined,
): Promise<ProductRepresentation[]> {
  const remaining: ProductRepresentation[] = [];
  const id = String(productId);

  const store = await getStore();
  const products = (store.products || []) as Product[];

  if (products.some((p) => String(p?.id) === id)) remaining.push("aggregate:id");
  if (
    slug &&
    products.some(
      (p) =>
        String(p?.id) === id &&
        String(p?.slug || "").toLowerCase() === slug.toLowerCase(),
    )
  ) {
    remaining.push("aggregate:slug");
  }
  if (products.filter((p) => isVisibleToPublic(p)).some((p) => String(p?.id) === id)) {
    remaining.push("public:listing");
  }

  if (d1Ready()) {
    try {
      const row = await d1First<{ value: string }>(
        `SELECT value FROM store_kv WHERE key = ?`,
        granularKey(id),
      );
      // A tombstone is not a survivor: it is what keeps the product hidden.
      if (row?.value) {
        let deleted = false;
        try {
          deleted = Boolean(JSON.parse(row.value)?._deleted);
        } catch {
          deleted = false;
        }
        if (!deleted) remaining.push("store_kv:granular");
      }
    } catch {
      /* An unreadable row cannot be reported as present. */
    }

    try {
      const identity = await d1First<{ product_id: string }>(
        `SELECT product_id FROM product_identity WHERE product_id = ?`,
        id,
      );
      if (identity?.product_id) remaining.push("d1:product_identity");
    } catch {
      /* Same. */
    }
  }

  return remaining;
}

/** Writes the `_deleted` marker that hides the product from every read. */
async function writeTombstone(productId: string): Promise<void> {
  if (!d1Ready()) return;
  await d1Run(
    `INSERT INTO store_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    granularKey(productId),
    JSON.stringify({ id: productId, _deleted: true }),
    new Date().toISOString(),
  );
}

/**
 * Removes a product from the catalogue and every mirror of it, then proves it.
 *
 * Returns `ok: false` with the surviving representations named rather than
 * throwing, so the route can report exactly what is still holding the product
 * instead of telling the admin UI it worked.
 */
export async function deleteProductEverywhere(
  productIdInput: string,
): Promise<ProductDeleteResult> {
  const id = String(productIdInput || "").trim();
  if (!id) {
    return { ok: false, id, slug: undefined, remaining: [], error: "missing_product_id" };
  }

  // The slug is captured before anything is removed, so the verifier can check
  // that the public URL stops resolving too.
  const before = await getStore();
  const existing = ((before.products || []) as Product[]).find((p) => String(p?.id) === id);
  const slug = existing?.slug ? String(existing.slug) : undefined;

  // 1. Hide it everywhere, immediately.
  try {
    await writeTombstone(id);
  } catch (err) {
    console.warn("[product-delete:tombstone_failed]", { id }, err);
  }

  // 2. Take it out of the aggregate, under the revision guard.
  try {
    await updateStore((store) => ({
      ...store,
      products: ((store.products || []) as Product[]).filter((p) => String(p?.id) !== id),
    }));
  } catch (err) {
    /*
      The tombstone from step 1 is deliberately left in place: the product stays
      hidden even though the aggregate still lists it, which is the safe half of
      a half-finished delete.
    */
    invalidateStoreCache();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[product-delete:aggregate_failed]", { id, error: message });
    return {
      ok: false,
      id,
      slug,
      remaining: await findRemainingProductRepresentations(id, slug),
      error: message,
    };
  }

  // 3. Now the mirrors, in the order that cannot uncover the product again.
  await deactivateGameDevicePerformance(id).catch((err) =>
    console.warn("[product-delete:performance_failed]", { id }, err),
  );
  await hardDeleteProductRelations(id);

  invalidateStoreCache();

  // 4. Prove it.
  const remaining = await findRemainingProductRepresentations(id, slug);
  if (remaining.length > 0) {
    console.error("[product-delete:incomplete]", { id, slug, remaining });
  }

  return { ok: remaining.length === 0, id, slug, remaining };
}
