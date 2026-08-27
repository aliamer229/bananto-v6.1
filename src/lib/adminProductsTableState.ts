/**
 * What the admin products table shows, decided in one place.
 *
 * The table used to work this out inline, as four independent conditions
 * scattered down the JSX:
 *
 *     loadStatus === "loading" && products.length === 0   → spinner
 *     loadStatus === "failed"  && products.length === 0   → error
 *     loadStatus === "loaded_empty" && products.length === 0 → empty
 *     products.length > 0                                  → rows
 *
 * Four conditions with no rule that exactly one of them holds, which is how a
 * response that set no state at all left every branch false except the first —
 * a spinner with nothing left in the system that could ever replace it.
 *
 * This is a total function instead: every input maps to exactly one of four
 * views, and the exhaustiveness is asserted in the tests rather than hoped for.
 */

export type ProductsLoadStatus = "loading" | "loaded_with_data" | "loaded_empty" | "failed";

export type ProductsTableView =
  /** First load, nothing to show yet. The only state that may show a spinner. */
  | "loading"
  /** The server confirmed the catalogue is empty. */
  | "empty"
  /** The load failed and there is nothing on screen; carries the retry. */
  | "error"
  /** Rows, possibly with a refresh running over them. */
  | "rows";

export interface ProductsTableState {
  view: ProductsTableView;
  /** A refresh over rows that are already on screen — never replaces them. */
  isRefreshing: boolean;
  /** Whether the error detail belongs on screen as a blocking message. */
  showsError: boolean;
}

export function productsTableState(input: {
  status: ProductsLoadStatus;
  rowCount: number;
  isRefreshing?: boolean;
}): ProductsTableState {
  const hasRows = input.rowCount > 0;

  /*
    Rows win over every status. A refresh that fails, a sort that times out, a
    store outage — none of them should replace a table the admin is reading
    with an error page, and none should blank it. The failure is reported
    beside the rows instead.
  */
  if (hasRows) {
    return { view: "rows", isRefreshing: Boolean(input.isRefreshing), showsError: false };
  }

  switch (input.status) {
    case "failed":
      return { view: "error", isRefreshing: false, showsError: true };
    case "loaded_empty":
      return { view: "empty", isRefreshing: false, showsError: false };
    case "loaded_with_data":
      /*
        Rows were loaded and then filtered away — by a search, or a chip. That
        is an answer, not a load in progress, so it must not show a spinner.
      */
      return { view: "empty", isRefreshing: Boolean(input.isRefreshing), showsError: false };
    case "loading":
      return { view: "loading", isRefreshing: false, showsError: false };
  }
}
