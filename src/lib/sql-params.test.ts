import { describe, expect, it } from "vitest";

import {
  assertBoundParameters,
  chunkForParams,
  D1_MAX_BOUND_PARAMETERS,
  rowsPerStatement,
  SAFE_SQL_VARIABLES,
} from "./sql-params";

describe("bound-parameter budget", () => {
  it("stays under D1's ceiling with room for the statement's own binds", () => {
    expect(SAFE_SQL_VARIABLES).toBeLessThan(D1_MAX_BOUND_PARAMETERS);
  });

  it("sizes a group so its parameters fit", () => {
    // 27 columns is the projection's width — the shape that bound 540 and was
    // rejected at the 100th variable.
    expect(rowsPerStatement(27) * 27).toBeLessThan(D1_MAX_BOUND_PARAMETERS);
    for (const columns of [1, 5, 17, 27, 49, 89]) {
      expect(rowsPerStatement(columns) * columns).toBeLessThan(D1_MAX_BOUND_PARAMETERS);
    }
  });

  it("leaves room for parameters the statement binds outside the rows", () => {
    expect(rowsPerStatement(10, 40) * 10 + 40).toBeLessThan(D1_MAX_BOUND_PARAMETERS);
  });

  it("chunks a catalogue into groups that each fit one statement", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    const groups = chunkForParams(rows, 27);
    expect(groups.flat()).toHaveLength(1000);
    for (const group of groups) {
      expect(group.length * 27).toBeLessThan(D1_MAX_BOUND_PARAMETERS);
      expect(group.length).toBeGreaterThan(0);
    }
  });

  it("never emits an empty group, even for a row wider than the budget", () => {
    expect(chunkForParams([1, 2], 500)).toEqual([[1], [2]]);
  });

  it("names the query and the count rather than reporting a character offset", () => {
    expect(() => assertBoundParameters("product_index.insert", new Array(140).fill(0))).toThrow(
      /product_index\.insert would bind 140 variables/,
    );
    expect(() => assertBoundParameters("ok", new Array(89).fill(0))).not.toThrow();
  });
});
