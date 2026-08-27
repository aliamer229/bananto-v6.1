/**
 * What `/api/admin/products` actually told us.
 *
 * The admin products screen had three ways to report a failure as a success,
 * and all three ended with the same picture: a table that says the database
 * holds nothing, or a spinner that never stops.
 *
 * 1. **Success was read off `res.ok` alone.** A 200 whose body would not parse,
 *    or a 200 carrying `{ success: false }` instead of an array, set
 *    `productsOk = true` and then fell through every branch without touching
 *    any state — so the table kept its initial `loading` status forever.
 * 2. **An empty page was always an empty database.** The response carries
 *    `d1Count`; nothing compared it against the rows actually returned, so a
 *    request that came back empty over a full catalogue rendered as
 *    "0 من أصل 0".
 * 3. **The real status was thrown away.** A non-OK store response was never
 *    recorded, which is why the screen could only ever say `HTTP err`.
 *
 * These are pure decisions over a payload, kept out of the component so they
 * can be tested against every shape the endpoint can return.
 */

/** One completed request, however it went. */
export type AdminFetchResult =
  | { ok: true; path: string; status: number; ms: number; data: unknown }
  | { ok: false; path: string; status: number | null; ms: number; reason: string; body?: string };

export interface ProductsVerdict {
  /** Whether the products table may be rendered from this response. */
  usable: boolean;
  /** Rows to render. Empty is legitimate only when `usable` is true. */
  products: Record<string, unknown>[];
  /** How many rows D1 reports holding, for "showing N of M". */
  d1Count: number;
  /** One line naming the path, the status, the reason and the timing. */
  problem: string;
}

/** A human- and log-matchable description of a failed request. */
export function describeFailure(result: AdminFetchResult): string {
  if (result.ok) return "";
  const status = result.status === null ? "no response" : `HTTP ${result.status}`;
  // The reason often already opens with the status ("HTTP 500"); repeating it
  // turns a diagnostic into noise.
  const reason = result.reason === status ? "" : result.reason;
  return [result.path, status, reason, result.body]
    .filter(Boolean)
    .join(" — ")
    .concat(` (${result.ms}ms)`);
}

function normaliseRow(row: Record<string, unknown>): Record<string, unknown> {
  const id = String(row["id"] ?? "");
  const title = typeof row["title"] === "string" ? row["title"].trim() : "";
  const titleEn = typeof row["titleEn"] === "string" ? row["titleEn"].trim() : "";
  return {
    ...row,
    id,
    title: title || titleEn || id,
    titleEn: titleEn || title || id,
    slug: typeof row["slug"] === "string" ? row["slug"] : id,
  };
}

/**
 * Decides whether a products response may be rendered, and as what.
 *
 * Refuses in every case where rendering would state something untrue about the
 * catalogue. An empty catalogue is a real answer; an empty *page* over a
 * catalogue D1 says is full is not.
 */
export function interpretProductsPayload(result: AdminFetchResult): ProductsVerdict {
  const empty = { usable: false, products: [], d1Count: 0 };

  if (!result.ok) return { ...empty, problem: describeFailure(result) };

  const data = result.data as Record<string, unknown> | null;
  const rows = data?.["products"];
  if (!Array.isArray(rows)) {
    return {
      ...empty,
      problem: `${result.path} — HTTP ${result.status} without a products array (${result.ms}ms)`,
    };
  }

  const products = rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map(normaliseRow);

  const reported = Number(data?.["d1Count"] ?? data?.["total"] ?? Number.NaN);
  const d1Count = Number.isFinite(reported) ? reported : products.length;

  if (products.length === 0 && d1Count > 0) {
    return {
      ...empty,
      d1Count,
      problem: `${result.path} — D1 reports ${d1Count} products but the response carried none (${result.ms}ms)`,
    };
  }

  return { usable: true, products, d1Count, problem: "" };
}
