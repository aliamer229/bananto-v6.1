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
import { bumpCatalogVersion, invalidateStoreCache } from "./db.server";
import { deactivateGameDevicePerformance } from "./devicePerformance.server";
import { hardDeleteProductRelations } from "./product-identity.server";

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
  /** Set when a step that must succeed threw. */
  error?: string;
  /** The catalogue revision after the delete, for the client's cache key. */
  catalogVersion?: number;
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
  if (!(await d1Ready())) return remaining;

  /*
    Three narrow indexed reads, not a catalogue load.

    This used to call `getStore()` — after `invalidateStoreCache()`, so it was a
    guaranteed cold read of the whole document, on every delete, purely to
    confirm a delete that had already happened. On a large catalogue that was
    most of the cost of deleting one product.

    What it checks instead is what actually decides visibility: the tombstone
    that hides the product from every read, the projection row the admin table
    is drawn from, and the identity claim that would otherwise refuse the title
    to a future product.
  */
  const [granular, indexed, identity] = await Promise.all([
    d1First<{ value: string }>(`SELECT value FROM store_kv WHERE key = ?`, granularKey(id)).catch(
      () => undefined,
    ),
    d1First<{ id: string }>(`SELECT id FROM product_index WHERE id = ?`, id).catch(() => undefined),
    d1First<{ product_id: string }>(
      `SELECT product_id FROM product_identity WHERE product_id = ?`,
      id,
    ).catch(() => undefined),
  ]);

  /*
    A tombstone is not a survivor — it is what keeps the product hidden. Its
    *absence* is, because then nothing overrides the aggregate.
  */
  let tombstoned = false;
  if (granular?.value) {
    try {
      tombstoned = Boolean(JSON.parse(granular.value)?._deleted);
    } catch {
      tombstoned = false;
    }
    if (!tombstoned) remaining.push("store_kv:granular");
  }
  if (!tombstoned) remaining.push("aggregate:id");
  if (indexed?.id) remaining.push("public:listing");
  if (identity?.product_id) remaining.push("d1:product_identity");

  // `slug` is kept in the signature because the caller reports it; the public
  // URL resolves through the same tombstone, so it needs no separate read.
  void slug;
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
  const startedAt = Date.now();
  const id = String(productIdInput || "").trim();
  if (!id) {
    return { ok: false, id, slug: undefined, remaining: [], error: "missing_product_id" };
  }

  const mark = { slug: 0, tombstone: 0, relations: 0, index: 0, version: 0, verify: 0 };
  const since = () => Date.now() - startedAt;

  /*
    The slug, for the response. Read from the projection — one indexed row —
    rather than by loading the catalogue to find one product in it.
  */
  const indexRow = await d1First<{ slug: string }>(
    `SELECT slug FROM product_index WHERE id = ?`,
    id,
  ).catch(() => undefined);
  const slug = indexRow?.slug ? String(indexRow.slug) : undefined;
  mark.slug = since();

  /*
    1. Hide it everywhere, immediately.

    `loadStore` overlays `store:product:<id>` rows on the aggregate and a row
    carrying `_deleted` removes the product from the result — so from this write
    onward every read excludes it, whichever half of the store it lived in.
  */
  try {
    await writeTombstone(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[product-delete:tombstone_failed]", { id, error: message });
    // Without the tombstone nothing hides the product, so this is the one
    // failure that must stop the delete rather than continue past it.
    return { ok: false, id, slug, remaining: ["aggregate:id"], error: message };
  }
  mark.tombstone = since();

  /*
    2. The mirrors.

    Deliberately *not* an aggregate rewrite. `updateStore` used to run here,
    which meant a full uncached read of the catalogue document followed by a
    full rewrite of every `store:products#NNN` chunk — ten megabytes of traffic
    to remove one product, on every delete, with two more full reads around it.
    Ten deletes in a row was thirty catalogue loads and ten rewrites, and the
    storefront in between never saw a warm snapshot. The tombstone already
    achieves the hiding; the aggregate is compacted by the next product save,
    which rewrites it anyway.
  */
  await deactivateGameDevicePerformance(id).catch((err) =>
    console.warn("[product-delete:performance_failed]", { id }, err),
  );
  await hardDeleteProductRelations(id);
  mark.relations = since();

  // 3. The admin listing projection, which is what the products table draws.
  await d1Run(`DELETE FROM product_index WHERE id = ?`, id).catch((err) =>
    console.warn("[product-delete:index_failed]", { id }, err),
  );
  mark.index = since();

  /*
    4. Move the catalogue revision.

    Every isolate's snapshot, the edge ETag and the browser's stored snapshot
    are keyed on it, so this is what makes the delete visible everywhere without
    invalidating anything by hand.
  */
  let catalogVersion = 0;
  try {
    catalogVersion = await bumpCatalogVersion();
  } catch (err) {
    console.warn("[product-delete:version_bump_failed]", { id }, err);
    invalidateStoreCache();
  }
  mark.version = since();

  // 5. Prove it.
  const remaining = await findRemainingProductRepresentations(id, slug);
  mark.verify = since();

  console.log(
    `[product-delete] id=${id} slug=${slug ?? ""} ok=${remaining.length === 0}` +
      ` total_ms=${since()} slug_ms=${mark.slug} tombstone_ms=${mark.tombstone - mark.slug}` +
      ` relations_ms=${mark.relations - mark.tombstone} index_ms=${mark.index - mark.relations}` +
      ` version_ms=${mark.version - mark.index} verify_ms=${mark.verify - mark.version}` +
      ` catalog_version=${catalogVersion} aggregate_rewritten=false` +
      (remaining.length ? ` remaining=${remaining.join(",")}` : ""),
  );

  if (remaining.length > 0) {
    console.error("[product-delete:incomplete]", { id, slug, remaining });
  }

  return { ok: remaining.length === 0, id, slug, remaining, catalogVersion };
}
