export interface CdnImageOptions {
  width?: number;
  format?: "avif" | "webp" | "auto";
  quality?: number;
  /**
   * Strip the empty field around a packshot before encoding.
   *
   * For surfaces that frame a **box** — the Front Box Cover and the card roles
   * built on it. Supplier feeds ship those as a small box adrift in a large
   * white rectangle, and that margin is in the file, so `object-fit: contain`
   * faithfully reproduces the problem.
   *
   * Deliberately opt-in. A case wrap, a banner and a screenshot reach their own
   * edges by design, and trimming one would cut into the picture. The server
   * refuses any crop it is not confident about, so the worst case is the image
   * exactly as it is today.
   */
  trim?: boolean;
}

/**
 * Route remote and catalog images through the Cloudflare edge proxy (`/api/img`)
 * with smart AVIF / WebP transformation, width constraints, and edge caching.
 */
export function cdnImage(src?: string | null, options?: CdnImageOptions): string {
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  const params = new URLSearchParams();

  if (options?.width && options.width > 0) {
    params.set("w", String(options.width));
  }
  if (options?.format && options.format !== "auto") {
    params.set("format", options.format);
  }
  if (options?.quality && options.quality > 0) {
    params.set("q", String(options.quality));
  }
  if (options?.trim) {
    params.set("trim", "1");
  }

  const queryString = params.toString() ? `&${params.toString()}` : "";

  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      if (typeof window !== "undefined" && url.host === window.location.host) {
        return queryString ? `${url.pathname}?${params.toString()}` : src;
      }
      return `/api/img?u=${encodeURIComponent(src)}${queryString}`;
    } catch {
      return src;
    }
  }

  // Local images (e.g. /img/... or /uploads/...)
  if (queryString && src.startsWith("/")) {
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}${params.toString()}`;
  }

  return src;
}

/**
 * Build responsive srcSet for `<picture>` `<source>` elements.
 * Generates width descriptors (e.g., 240w, 480w, 800w, 1200w).
 */
export function buildSrcSet(
  src: string | undefined | null,
  format: "avif" | "webp",
  widths: number[] = [240, 480, 800],
  options?: Pick<CdnImageOptions, "trim">
): string {
  if (!src) return "";
  return widths
    // `trim` has to ride along: a srcSet whose candidates are untrimmed would
    // undo the crop the moment the browser picked a different width.
    .map((w) => `${cdnImage(src, { width: w, format, ...(options?.trim ? { trim: true } : {}) })} ${w}w`)
    .join(", ");
}
