/**
 * Entry point bundled for the product_index rebuild.
 *
 * Re-exports the application's own projection code so the index rows are built
 * by the same `toIndexRow` the Worker uses — including the folded sort key and
 * the `performance_required` flag, which is the field the stale index is
 * currently getting wrong.
 */
export { rebuildProductIndex, productIndexCount, toIndexRow } from "@/lib/product-index.server";
export { d1All, d1Run } from "@/lib/d1.server";
