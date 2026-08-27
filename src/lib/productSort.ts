/**
 * The order the admin products table is in.
 *
 * ## Why this is one module and not two comparators
 *
 * The list is sorted twice for one screen: once on the server, because
 * `/api/admin/products` paginates and a page of an unordered list is not a
 * page of anything, and once in the browser, because the dashboard keeps the
 * catalogue in memory and edits it in place — a saved price has to move to its
 * new row without a refetch. Two comparators would drift, and the symptom is
 * the worst kind: a row that is in the right place until you touch it.
 *
 * ## Ordering rules that are easy to get wrong
 *
 * - **Price is numeric.** Sorting `"9000"` against `"22000"` as text puts the
 *   22,000 IQD product *above* the 9,000 one on ascending.
 * - **Names are compared with the Arabic collator.** `localeCompare` with a
 *   plain `<` puts every Arabic title in code-point order, which is not
 *   alphabetical in Arabic and is not what an admin scanning the column
 *   expects. `ar` collation also folds the alef variants (أ إ آ ا) together.
 * - **Every comparison ends in a tie-break on `id`.** Without it two products
 *   with the same price have no defined order between them, so they can swap
 *   places between two requests — which on a paginated list means a product
 *   appears twice on page 2 and never on page 3.
 * - **Missing values sort last in both directions.** A product with no price
 *   yet is not "the cheapest"; reversing the direction should not promote it
 *   to the top of the screen.
 */

export type ProductSortField = "updated" | "price" | "name" | "order";
export type SortDirection = "asc" | "desc";

export interface ProductSort {
  field: ProductSortField;
  direction: SortDirection;
}

/** The default: the existing behaviour — newest imports first. */
export const DEFAULT_PRODUCT_SORT: ProductSort = { field: "order", direction: "desc" };

const FIELDS: ReadonlySet<string> = new Set<ProductSortField>(["updated", "price", "name", "order"]);

/** Reads a sort out of query params or stored state, falling back to the default. */
export function parseProductSort(
  field: unknown,
  direction: unknown,
  fallback: ProductSort = DEFAULT_PRODUCT_SORT,
): ProductSort {
  const f = typeof field === "string" && FIELDS.has(field) ? (field as ProductSortField) : fallback.field;
  const d = direction === "asc" || direction === "desc" ? direction : fallback.direction;
  return { field: f, direction: d };
}

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function time(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * When the catalogue last recorded a change to this product.
 *
 * Several spellings exist across the write paths and across rows imported at
 * different times, so all of them are read and the newest wins. `createdAt` is
 * the floor: a product that has never been edited was last modified when it was
 * created, which is a truthful answer and keeps it in the ordering rather than
 * dumping it at the end.
 */
export function lastModifiedAt(product: Row): number | null {
  const candidates = [
    product["updatedAt"],
    product["updated_at"],
    product["modifiedAt"],
    product["lastModified"],
    product["createdAt"],
    product["created_at"],
  ];
  let newest: number | null = null;
  for (const candidate of candidates) {
    const value = time(candidate);
    if (value !== null && (newest === null || value > newest)) newest = value;
  }
  return newest;
}

/** The price an admin sees in the table. */
export function sortablePrice(product: Row): number | null {
  return num(product["price"]) ?? num(product["basePrice"]) ?? null;
}

/** The name an admin reads in the table — the Arabic title, then the English. */
export function sortableName(product: Row): string {
  return text(product["title"]) || text(product["titleEn"]) || text(product["slug"]);
}

/**
 * Arabic-aware, case-insensitive comparison.
 *
 * Built once and lazily. Once, because constructing an `Intl.Collator` per
 * comparison turns a sort of a few thousand products into a visible pause.
 * Lazily, because this module is imported by a Cloudflare Worker route and
 * module-scope work runs in the isolate's global scope, where a runtime
 * carrying reduced ICU data is a worse place to discover a problem than the
 * first call.
 *
 * The fallback matters for correctness, not just for safety: this same
 * comparator runs on the server (which paginates) and in the browser (which
 * re-sorts in place). If one of them silently collated differently, rows would
 * move when you touched them. Falling back to `localeCompare` keeps both ends
 * on the same rule whatever the runtime offers.
 */
let collatorCache: { compare: (a: string, b: string) => number } | null = null;
function compareNames(a: string, b: string): number {
  if (!collatorCache) {
    try {
      collatorCache = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
    } catch {
      collatorCache = { compare: (x, y) => x.localeCompare(y, "ar", { numeric: true }) };
    }
  }
  return collatorCache.compare(a, b);
}

/** Existing default ordering: explicit display order, then release/creation date. */
function orderRank(product: Row): number {
  return num(product["displayOrder"]) ?? 0;
}

/**
 * Compares two products, `field` ascending. The caller flips for `desc`.
 *
 * Returns `null` for "these are equal on this field" so the caller can apply
 * the missing-values-last rule and the id tie-break without re-deciding them
 * per field.
 */
function compareOn(a: Row, b: Row, field: ProductSortField): number {
  switch (field) {
    case "price": {
      const left = sortablePrice(a);
      const right = sortablePrice(b);
      if (left === null && right === null) return 0;
      // Missing last, whichever way the column is pointing.
      if (left === null) return Number.POSITIVE_INFINITY;
      if (right === null) return Number.NEGATIVE_INFINITY;
      return left - right;
    }
    case "updated": {
      const left = lastModifiedAt(a);
      const right = lastModifiedAt(b);
      if (left === null && right === null) return 0;
      if (left === null) return Number.POSITIVE_INFINITY;
      if (right === null) return Number.NEGATIVE_INFINITY;
      return left - right;
    }
    case "name": {
      const left = sortableName(a);
      const right = sortableName(b);
      if (!left && !right) return 0;
      if (!left) return Number.POSITIVE_INFINITY;
      if (!right) return Number.NEGATIVE_INFINITY;
      return compareNames(left, right);
    }
    case "order":
    default: {
      const byOrder = orderRank(a) - orderRank(b);
      if (byOrder !== 0) return byOrder;
      const left = time(a["releaseDate"]) ?? lastModifiedAt(a) ?? 0;
      const right = time(b["releaseDate"]) ?? lastModifiedAt(b) ?? 0;
      return left - right;
    }
  }
}

/**
 * A comparator for `Array.prototype.sort`.
 *
 * `±Infinity` from {@link compareOn} means "one side has no value" — that
 * ordering is absolute, so the direction flip is applied only to real
 * comparisons and the empty rows stay at the bottom either way.
 */
export function productComparator({ field, direction }: ProductSort) {
  const flip = direction === "desc" ? -1 : 1;
  return (a: Row, b: Row): number => {
    const raw = compareOn(a, b, field);
    if (raw === Number.POSITIVE_INFINITY) return 1;
    if (raw === Number.NEGATIVE_INFINITY) return -1;
    if (raw !== 0) return raw * flip;
    // Same value on the sorted column: give them a fixed order so pagination
    // cannot show one product twice and another not at all.
    return String(a["id"] ?? "").localeCompare(String(b["id"] ?? ""));
  };
}

/** Sorted copy. Never sorts in place — callers hold React state. */
export function sortProducts<T extends Row>(products: readonly T[], sort: ProductSort): T[] {
  return [...products].sort(productComparator(sort));
}
