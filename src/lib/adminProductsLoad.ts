/**
 * How a `/api/admin/products` response becomes one of three admin-table states.
 *
 * The rule that matters here is the one the old loader got wrong: **an empty
 * list is only an empty catalogue when the server says the catalogue is
 * empty.** `d1Count` is the total D1 holds before pagination, so a zero-length
 * page next to a non-zero count is a failed read wearing the shape of a
 * success. Treating it as success is how the admin page reported
 * "0 من أصل 0 منتج مسجل في D1" while the products were still there.
 *
 * A 200 that carries no `products` array at all — an auth redirect, a truncated
 * response — is `unusable` too. The previous loader accepted it, set no state,
 * and left the table spinning with nothing left to change it.
 *
 * Kept out of the component so the decision can be tested against real payload
 * shapes rather than through a rendered dashboard.
 */

export interface AdminProductRow {
  id: string;
  title: string;
  titleEn: string;
  slug: string;
  [key: string]: unknown;
}

export type ProductsPayloadVerdict =
  | { state: "loaded"; products: AdminProductRow[]; d1Count: number }
  | { state: "empty"; products: []; d1Count: 0 }
  /** Retry-worthy: the response cannot be believed, whatever its status was. */
  | { state: "unusable"; reason: string };

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Fills the identity fields the table sorts and links on, without inventing data. */
function normalizeRow(raw: Record<string, unknown>): AdminProductRow {
  const id = text(raw["id"]) || String(raw["id"] ?? "");
  const title = text(raw["title"]);
  const titleEn = text(raw["titleEn"]);
  return {
    ...raw,
    id,
    title: title || titleEn || id,
    titleEn: titleEn || title || id,
    slug: typeof raw["slug"] === "string" ? raw["slug"] : id,
  };
}

export function interpretProductsPayload(payload: unknown): ProductsPayloadVerdict {
  if (!payload || typeof payload !== "object") {
    return { state: "unusable", reason: "payload is not an object" };
  }
  const body = payload as { products?: unknown; d1Count?: unknown; error?: unknown };
  if (!Array.isArray(body.products)) {
    return {
      state: "unusable",
      reason: text(body.error) || "response carries no products array",
    };
  }

  const products = body.products
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map(normalizeRow);

  const declared = Number(body.d1Count);
  const d1Count = Number.isFinite(declared) ? declared : products.length;

  if (products.length > 0) return { state: "loaded", products, d1Count };

  if (d1Count > 0) {
    return {
      state: "unusable",
      reason: `empty page while D1 reports ${d1Count} products`,
    };
  }

  return { state: "empty", products: [], d1Count: 0 };
}

/* ------------------------------ retry policy ------------------------------ */

export interface EndpointAttempt {
  ok: boolean;
  data: unknown;
  /** One line naming the path, status and timing — logged and shown to the admin. */
  detail: string;
}

export type FetchJson = (path: string, signal: AbortSignal) => Promise<EndpointAttempt>;

export type LoadOutcome =
  | { state: "loaded"; products: AdminProductRow[]; d1Count: number; attempts: number }
  | { state: "empty"; attempts: number }
  | { state: "failed"; detail: string; attempts: number }
  /** The caller navigated away; the UI must keep whatever it already showed. */
  | { state: "aborted" };

/** Attempts per endpoint. Bounded on purpose — see {@link loadAdminProducts}. */
export const LOAD_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the product list until it can be believed, or until the attempts run
 * out — and then says so.
 *
 * The loop is bounded, and every exit assigns a terminal state. That is the
 * whole fix for the spinner that never stopped: previously a 200 carrying no
 * `products` array was recorded as a success, no state was written, and nothing
 * remained that could ever change the "جاري تحميل قائمة المنتجات من قاعدة
 * البيانات D1..." row. There are now exactly three endings — rows, a catalogue
 * the server confirms is empty, or an error carrying the failing path and
 * status next to a Retry button — plus `aborted`, which only happens when the
 * caller has navigated away and no longer has a table to update.
 */
export async function loadAdminProducts({
  fetchJson,
  path,
  signal,
  attempts = LOAD_ATTEMPTS,
  delay = sleep,
}: {
  fetchJson: FetchJson;
  path: string;
  signal: AbortSignal;
  attempts?: number;
  /** Injectable so tests do not wait out the real backoff. */
  delay?: (ms: number) => Promise<void>;
}): Promise<LoadOutcome> {
  let detail = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal.aborted) return { state: "aborted" };
    const result = await fetchJson(path, signal);
    if (signal.aborted) return { state: "aborted" };

    if (result.ok) {
      const verdict = interpretProductsPayload(result.data);
      if (verdict.state === "loaded") {
        return {
          state: "loaded",
          products: verdict.products,
          d1Count: verdict.d1Count,
          attempts: attempt + 1,
        };
      }
      if (verdict.state === "empty") return { state: "empty", attempts: attempt + 1 };
      detail = `${result.detail} — ${verdict.reason}`;
    } else {
      detail = result.detail;
    }

    if (attempt < attempts - 1) await delay(1000 * 2 ** attempt);
  }

  if (signal.aborted) return { state: "aborted" };
  return { state: "failed", detail, attempts };
}
