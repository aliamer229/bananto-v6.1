/**
 * High-performance browser-side image preloader & memory cache.
 * Warms the browser disk cache, HTTP cache, and decodes images ahead of time
 * so cover art displays instantly upon rendering.
 */
import { cdnImage } from "./img";

const preloadedUrls = new Set<string>();
const decodingPromises = new Map<string, Promise<void>>();

/**
 * Preloads and decodes an image URL in the browser background.
 */
export function preloadImage(
  src?: string | null,
  options?: { width?: number; quality?: number; format?: "avif" | "webp" },
): Promise<void> {
  if (!src || typeof window === "undefined") return Promise.resolve();
  const url = cdnImage(src, options);
  if (!url || preloadedUrls.has(url)) return Promise.resolve();

  const existing = decodingPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    const done = () => {
      preloadedUrls.add(url);
      decodingPromises.delete(url);
      resolve();
    };

    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(done).catch(done);
      } else {
        done();
      }
    };
    img.onerror = done;
    img.src = url;
  });

  decodingPromises.set(url, promise);
  return promise;
}

/**
 * Batch-preloads game covers with prioritized idle scheduling.
 */
export function preloadGameCovers(
  products: Array<Record<string, unknown> | null | undefined>,
  maxCount = 20,
) {
  if (typeof window === "undefined" || !products?.length) return;

  const run = () => {
    let count = 0;
    for (const p of products) {
      if (!p || count >= maxCount) break;
      const rawUrl =
        (p["coverUrl"] as string) ||
        (p["image"] as string) ||
        (p["coverImage"] as string) ||
        (p["cartridgeImage"] as string);

      if (rawUrl) {
        // Preload thumbnail size for cards & high-res for hubs
        preloadImage(rawUrl, { width: 360 });
        count++;
      }
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 150);
  }
}

/**
 * Preload 3D box base textures and case assets.
 */
export function preload3DBoxAssets() {
  if (typeof window === "undefined") return;
  preloadImage("/textures/GZAfvAF3.jpg");
}
