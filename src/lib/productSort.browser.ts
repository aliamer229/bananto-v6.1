/**
 * Remembers which way the admin products table was sorted.
 *
 * The sort has to survive more than a re-render. An admin working through a
 * price audit sorts by price ascending, opens a product, saves it, comes back —
 * and if the table has snapped to its default order they have lost their place
 * in a list of thousands. Same for changing the search box, toggling a filter,
 * or moving to the next page: those change *which* products are shown, never
 * the order they are shown in.
 *
 * It lives in `localStorage` rather than in component state because the two
 * pieces that need it are not near each other in the tree: the table owns the
 * column headers, and the dashboard's loader — several levels up — is what puts
 * `sort` and `dir` on the request. Storage is the shortest honest path between
 * them, and it is the same mechanism that makes the choice outlive a reload.
 */
import {
  DEFAULT_PRODUCT_SORT,
  parseProductSort,
  type ProductSort,
} from "./productSort";

const STORAGE_KEY = "bananto_admin_product_sort";

/**
 * The stored sort, or the default.
 *
 * Every access is wrapped: `localStorage` throws outright in a browser set to
 * block site data, and returns nothing useful in a private window. Neither is a
 * reason to fail to render a table.
 */
export function readProductSort(): ProductSort {
  if (typeof window === "undefined") return DEFAULT_PRODUCT_SORT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRODUCT_SORT;
    const parsed = JSON.parse(raw) as Partial<ProductSort>;
    return parseProductSort(parsed?.field, parsed?.direction);
  } catch {
    return DEFAULT_PRODUCT_SORT;
  }
}

export function writeProductSort(sort: ProductSort): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // A sort that cannot be remembered still works for this session.
  }
}

/** `?sort=price&dir=asc`, for the admin products request. */
export function productSortQuery(sort: ProductSort): string {
  return `sort=${encodeURIComponent(sort.field)}&dir=${encodeURIComponent(sort.direction)}`;
}

/**
 * What clicking a column header does.
 *
 * Clicking the column you are already on reverses it; clicking a new one starts
 * it in the direction that column is most useful in. Newest-first and
 * most-expensive-first are what an admin is looking for by default; names are
 * the exception, where A→Z is the obvious first press.
 */
export function toggleProductSort(current: ProductSort, field: ProductSort["field"]): ProductSort {
  if (current.field === field) {
    return { field, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { field, direction: field === "name" ? "asc" : "desc" };
}
