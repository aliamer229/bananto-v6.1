/**
 * A hard ceiling on bound parameters, and a chunker that respects it.
 *
 * Cloudflare D1 rejects any statement carrying more than 100 bound variables:
 *
 *     D1_ERROR: too many SQL variables at offset 488: SQLITE_ERROR
 *
 * The offset is a character position, not a parameter index, which makes the
 * message hard to act on — offset 488 was the 100th `?` in a 540-parameter
 * multi-row INSERT. It is also far below SQLite's own default of 999, so a
 * statement sized against SQLite passes every local test and fails in
 * production. That is what happened, and it is why the limit lives in one named
 * constant with a guard behind it rather than in an arithmetic comment.
 *
 * Nothing here is a workaround for a limit we happen to be near: it makes the
 * bound-parameter count a function of the *page size*, never of the catalogue.
 */

/** D1's documented maximum. Statements at or above this are rejected. */
export const D1_MAX_BOUND_PARAMETERS = 100;

/**
 * What we will actually generate. The margin exists because a statement is
 * rarely only its variable list — a `WHERE` clause, a `LIMIT`, an `OFFSET` all
 * bind too, and a chunk sized to the exact ceiling breaks the moment one is
 * added.
 */
export const SAFE_SQL_VARIABLES = 90;

/**
 * How many rows of `columnCount` fields may share one statement.
 *
 * `reserved` is for parameters the statement binds outside the rows.
 */
export function rowsPerStatement(columnCount: number, reserved = 0): number {
  if (columnCount <= 0) return 0;
  const budget = SAFE_SQL_VARIABLES - reserved;
  return Math.max(1, Math.floor(budget / columnCount));
}

/**
 * Splits `items` so each group's parameters fit one statement.
 *
 * A group is never empty, so a single row wider than the budget still gets its
 * own statement rather than silently disappearing — it will fail loudly at the
 * guard instead, which is the right outcome for a table nobody should be
 * writing that way.
 */
export function chunkForParams<T>(items: T[], columnCount: number, reserved = 0): T[][] {
  const size = rowsPerStatement(columnCount, reserved);
  const groups: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    groups.push(items.slice(offset, offset + size));
  }
  return groups;
}

/**
 * Refuses to hand D1 a statement it will reject.
 *
 * Called on every dynamically sized statement before it executes. Throwing
 * beats letting D1 answer, because the thrown message names the query and the
 * count while `too many SQL variables at offset 488` names neither.
 */
export function assertBoundParameters(queryName: string, params: readonly unknown[]): void {
  if (params.length >= D1_MAX_BOUND_PARAMETERS) {
    throw new Error(
      `sql_parameter_limit: ${queryName} would bind ${params.length} variables,` +
        ` and D1 accepts at most ${D1_MAX_BOUND_PARAMETERS - 1}.` +
        ` Chunk it with chunkForParams().`,
    );
  }
}
