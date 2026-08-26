/**
 * The client half of catalogue invalidation.
 *
 * A deleted product had four places to hide on the way to the screen, and
 * fixing the server only closed the first:
 *
 * 1. **The server's own snapshot** — `getStore()` keeps a per-isolate cache, so
 *    a different isolate answered the next request from a minute-old copy.
 *    Fixed in `db.server.ts` by validating the snapshot against `store_rev`.
 * 2. **The Cloudflare edge** — bounded by `s-maxage=5, must-revalidate` and an
 *    ETag that now folds in the catalogue version.
 * 3. **The service worker** — `/api/data` is network-first, so an online
 *    visitor never sees a stale catalogue; `notifyCatalogChanged()` also drops
 *    the data cache outright after a mutation.
 * 4. **`localStorage`** — this file. The storefront keeps a snapshot so the
 *    first paint has products in it, and that snapshot is what showed a deleted
 *    product for one frame after the catalogue had already moved on.
 *
 * The snapshot is stamped with the catalogue version it came from. A stamp
 * older than the last version this browser has seen is not used for first
 * paint, so a mutation the visitor already knows about cannot flash back.
 */

const SNAPSHOT_KEY = "banan_store_cache_v3";
/** The newest catalogue version this browser has been told about. */
const SEEN_VERSION_KEY = "banan_catalog_version";

/** Key used before the version stamp existed. Cleared on sight. */
const LEGACY_SNAPSHOT_KEY = "banan_store_cache_v2";

export interface CatalogSnapshot<T = unknown> {
  version: number;
  at: number;
  data: T;
}

function safeLocal(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    // Private mode and "block site data" both throw on access, not on use.
    return undefined;
  }
}

/** The newest catalogue version this browser has seen, from any response. */
export function seenCatalogVersion(): number {
  const store = safeLocal();
  if (!store) return 0;
  try {
    return Number(store.getItem(SEEN_VERSION_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

/** Records the version carried by a catalogue response. */
export function rememberCatalogVersion(version: number | undefined | null): void {
  const store = safeLocal();
  if (!store || !version || !Number.isFinite(version)) return;
  try {
    if (version > seenCatalogVersion()) store.setItem(SEEN_VERSION_KEY, String(version));
  } catch {
    /* Quota or blocked storage: the snapshot is an optimisation, not state. */
  }
}

/**
 * The first-paint snapshot, or `undefined` when there is nothing trustworthy.
 *
 * Refuses a snapshot stamped older than the newest version this browser has
 * seen — that is precisely the copy that still contains the deleted product.
 */
export function readCatalogSnapshot<T = unknown>(): T | undefined {
  const store = safeLocal();
  if (!store) return undefined;
  try {
    store.removeItem(LEGACY_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
  try {
    const raw = store.getItem(SNAPSHOT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CatalogSnapshot<T>;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return undefined;
    if (Number(parsed.version || 0) < seenCatalogVersion()) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

/** Stores a snapshot against the version it was served with. */
export function writeCatalogSnapshot<T = unknown>(data: T, version: number): void {
  const store = safeLocal();
  if (!store || !data) return;
  try {
    store.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ version, at: Date.now(), data } satisfies CatalogSnapshot<T>),
    );
  } catch {
    /* Over quota: first paint falls back to the network, which still works. */
  }
}

/** Drops the snapshot without touching anything else in storage. */
export function clearCatalogSnapshot(): void {
  const store = safeLocal();
  if (!store) return;
  try {
    store.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Call after a mutation lands, with the version the server returned.
 *
 * Targeted on purpose: it drops the catalogue snapshot and asks the service
 * worker to drop *its* data cache, and leaves every image and every unrelated
 * cache alone. Bumping the worker's `VERSION` would have thrown all of those
 * away to fix one product.
 */
export function notifyCatalogChanged(version?: number): void {
  rememberCatalogVersion(version);
  clearCatalogSnapshot();

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({ type: "catalog-changed" });
  } catch {
    /* No controller yet — nothing is cached to invalidate. */
  }
}
