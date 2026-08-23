/**
 * Browser side of {@link computeTrimBox}: decode once, measure once, remember.
 *
 * The analysis itself is cheap (a ≤320px downsample, a few passes over it), but
 * it still costs a decode and a `getImageData`, so it must never run on a render
 * path. Three layers make sure it doesn't:
 *
 * 1. **Stored** — a product carrying `cartridgeImageTrim` never gets analysed.
 *    That is the fast path for everything imported or saved through the admin
 *    editor, and it is what server-rendered HTML uses.
 * 2. **Session cache** — `localStorage`, keyed by URL. A repeat visitor skips
 *    the work entirely, including the decode.
 * 3. **In-flight map** — twenty cards showing the same cover analyse it once.
 *
 * Results are only ever *added* to a product's presentation; nothing here
 * mutates the stored catalogue.
 */
import { computeTrimBox, ANALYSIS_MAX_SIDE, TRIM_VERSION, type TrimResult } from "./imageTrim";

const STORE_KEY = "bananto_cover_trim_v1";
/** Cache is a convenience, not a database — keep it small enough to stay fast. */
const MAX_ENTRIES = 400;

export interface TrimRecord {
  trim: TrimResult | null;
  /** Natural size of the decoded file, used for aspect-correct framing. */
  naturalWidth: number;
  naturalHeight: number;
}

const memory = new Map<string, TrimRecord>();
const inFlight = new Map<string, Promise<TrimRecord | null>>();

let persisted: Record<string, TrimRecord> | null = null;

function loadPersisted(): Record<string, TrimRecord> {
  if (persisted) return persisted;
  persisted = {};
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, TrimRecord>;
      for (const [key, value] of Object.entries(parsed)) {
        // Entries written by an older algorithm are dropped, not trusted.
        if (value && (value.trim === null || value.trim?.version === TRIM_VERSION)) {
          persisted[key] = value;
        }
      }
    }
  } catch {
    // Private mode, quota, or corrupt JSON: the cache is optional.
  }
  return persisted;
}

function savePersisted(key: string, record: TrimRecord): void {
  try {
    const store = loadPersisted();
    store[key] = record;
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[k];
    }
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage is best-effort; a full quota must never break rendering.
  }
}

/** Cached answer for `url`, or `undefined` if it has never been measured. */
export function readTrimCache(url: string): TrimRecord | undefined {
  if (!url) return undefined;
  const hit = memory.get(url);
  if (hit) return hit;
  const stored = loadPersisted()[url];
  if (stored) {
    memory.set(url, stored);
    return stored;
  }
  return undefined;
}

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // `cdnImage()` rewrites remote artwork onto the same-origin /api/img proxy,
    // so the canvas stays untainted and `getImageData` is allowed. Requesting
    // CORS for a same-origin URL can only fail the load.
    try {
      if (/^https?:\/\//i.test(url) && new URL(url).origin !== window.location.origin) {
        img.crossOrigin = "anonymous";
      }
    } catch {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Measures `url` once and caches the answer.
 *
 * Resolves `null` when the image cannot be read at all (network, or a tainted
 * canvas on a cross-origin host the proxy did not cover). A successfully
 * measured image that simply needs no crop resolves with `trim: null`.
 */
export function measureTrim(url: string): Promise<TrimRecord | null> {
  if (!url || typeof window === "undefined") return Promise.resolve(null);

  const cached = readTrimCache(url);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(url);
  if (pending) return pending;

  const job = (async (): Promise<TrimRecord | null> => {
    const img = await decode(url);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;

    const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * scale));
    const h = Math.max(8, Math.round(img.naturalHeight * scale));

    let record: TrimRecord;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      record = {
        trim: computeTrimBox(data, w, h),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      };
    } catch {
      // A tainted canvas throws here. Show the untouched image.
      return null;
    }

    memory.set(url, record);
    savePersisted(url, record);
    return record;
  })().finally(() => {
    inFlight.delete(url);
  });

  inFlight.set(url, job);
  return job;
}

/** Queues {@link measureTrim} for when the browser is idle. */
export function scheduleTrim(url: string, done: (record: TrimRecord | null) => void): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    void measureTrim(url).then((record) => {
      if (!cancelled) done(record);
    });
  };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  const handle = idle ? idle(run) : globalThis.setTimeout(run, 120);
  return () => {
    cancelled = true;
    const cancelIdle = (globalThis as { cancelIdleCallback?: (id: number) => void })
      .cancelIdleCallback;
    if (idle && cancelIdle) cancelIdle(handle as number);
    else globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  };
}
