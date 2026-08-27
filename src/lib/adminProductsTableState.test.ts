import { describe, expect, it } from "vitest";

import {
  productsTableState,
  type ProductsLoadStatus,
  type ProductsTableView,
} from "./adminProductsTableState";

const STATUSES: ProductsLoadStatus[] = [
  "loading",
  "loaded_with_data",
  "loaded_empty",
  "failed",
];

describe("the products table always settles", () => {
  it("maps every reachable input to exactly one view", () => {
    const views = new Set<ProductsTableView>();
    for (const status of STATUSES) {
      for (const rowCount of [0, 1, 50]) {
        for (const isRefreshing of [false, true]) {
          const state = productsTableState({ status, rowCount, isRefreshing });
          expect(["loading", "empty", "error", "rows"]).toContain(state.view);
          views.add(state.view);
        }
      }
    }
    // All four are reachable — none is dead code hiding a missing branch.
    expect(views).toEqual(new Set(["loading", "empty", "error", "rows"]));
  });

  it("only ever spins on a first load that has not answered yet", () => {
    for (const status of STATUSES) {
      for (const rowCount of [0, 1, 50]) {
        const state = productsTableState({ status, rowCount });
        if (state.view === "loading") {
          expect(status).toBe("loading");
          expect(rowCount).toBe(0);
        }
      }
    }
  });

  it("never spins once the server has answered, however it answered", () => {
    for (const status of ["loaded_with_data", "loaded_empty", "failed"] as const) {
      expect(productsTableState({ status, rowCount: 0 }).view).not.toBe("loading");
    }
  });

  it("keeps rows through a refresh, a failed refresh and a store outage", () => {
    // Whatever the status says, a table with rows shows its rows.
    for (const status of STATUSES) {
      const state = productsTableState({ status, rowCount: 50, isRefreshing: true });
      expect(state.view).toBe("rows");
      expect(state.showsError).toBe(false);
    }
  });

  it("marks a refresh as a refresh rather than a load", () => {
    expect(productsTableState({ status: "loaded_with_data", rowCount: 50, isRefreshing: true })).
      toEqual({ view: "rows", isRefreshing: true, showsError: false });
  });

  it("shows the error only when there is nothing else on screen", () => {
    expect(productsTableState({ status: "failed", rowCount: 0 }).showsError).toBe(true);
    expect(productsTableState({ status: "failed", rowCount: 12 }).showsError).toBe(false);
  });

  it("treats a filtered-away result as an answer, not a pending load", () => {
    // Rows were loaded, then a search removed them all. A spinner here reads as
    // "still loading" and never goes away.
    expect(productsTableState({ status: "loaded_with_data", rowCount: 0 }).view).toBe("empty");
  });
});
