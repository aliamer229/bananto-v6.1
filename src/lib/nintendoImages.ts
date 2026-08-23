/**
 * The one place that decides which picture a product shows.
 *
 * ## Why this exists
 *
 * Every surface used to pick its own field. The home strip read
 * `cartridgeImage → image → coverImage`, the hub read
 * `coverImage → cartridgeImage → image`, the cart read one order for local
 * lines and a different one for server lines, and the add-to-cart toast reached
 * straight into the gallery. So one product legitimately showed four different
 * pictures on four screens, and a banner or a screenshot could end up standing
 * in for a box cover. There was no bug to fix in any single component — the bug
 * was that the decision had no owner.
 *
 * It has one now. Components ask {@link resolveNintendoImage} for a *usage* and
 * get back the field that usage is defined to mean.
 *
 * ## The fields, and what each one means
 *
 * | field | meaning |
 * | --- | --- |
 * | `cartridgeImage` | **canonical front box cover** — vertical retail packshot |
 * | `nintendoCardImage` | square / near-square art for compact platform cards |
 * | `coverHiResImage` | optional print-resolution front cover, for the 3D texture |
 * | `coverImage`, `image` | legacy front-cover carriers, kept as fallbacks |
 * | `galleryImages`, `gallery` | screenshots — never a cover |
 * | `bannerImage`, `banner` | wide key art — never a cover |
 *
 * `cartridgeImage` keeps its database name (thousands of rows and the whole
 * import template use it) but its *meaning* is now fixed: a clean rectangular
 * front cover. Nothing else in the app is allowed to be a "main cover" source.
 *
 * ## The rule that stops the old bugs coming back
 *
 * A banner or a gallery frame is never promoted into a cover slot. A product
 * with only screenshots shows the placeholder, because a wrong picture reads as
 * a data error to a customer while a placeholder reads as "artwork pending".
 */

/** Where the picture is going. Each value has a fixed, documented meaning. */
export type NintendoImageUsage =
  /** Vertical retail front cover: product hero, listings, bundles, cart, toast. */
  | "front-cover"
  /** Alias of `front-cover`, named for the call site that reads best. */
  | "listing-card"
  | "bundle-card"
  | "cart"
  | "toast"
  /** Compact platform card with a square-ish artwork window. */
  | "square-card"
  /** Highest-resolution front cover available, for the WebGL sleeve. */
  | "3d-texture"
  /** Wide key art. Never falls back to a cover. */
  | "banner";

export interface ResolvedImage {
  /** Empty string when nothing usable exists; callers show the placeholder. */
  url: string;
  /** Which product field the URL came from — useful in tests and diagnostics. */
  source: string;
  /** Stored crop rectangle for `url`, when the catalogue carries one. */
  trim?: unknown;
  /** True when `url` is the shared placeholder rather than product artwork. */
  isPlaceholder: boolean;
}

/**
 * Local, neutral placeholder. Deliberately not a photo of a different game:
 * the previous fallback pulled random stock imagery (and, worse, a hardcoded
 * table of "known" covers matched by title substring), so a product with no
 * artwork advertised somebody else's box.
 */
export const NINTENDO_IMAGE_PLACEHOLDER = "/illustrations/cover-placeholder.svg";

/** Product fields that carry a front box cover, best first. */
export const FRONT_COVER_FIELDS = [
  "cartridgeImage",
  "coverImage",
  "coverUrl",
  "box_front_url",
  "boxFrontUrl",
  "image",
  "mainImage",
  "imageUrl",
] as const;

/** Product fields that carry square / near-square card artwork. */
export const SQUARE_CARD_FIELDS = ["nintendoCardImage", "squareGameImage", "squareImage"] as const;

/** Product fields that carry a print-resolution cover for the 3D sleeve. */
export const HI_RES_COVER_FIELDS = ["coverHiResImage", "coverHiRes", "textureSourceImage"] as const;

/** Product fields that carry wide key art. Never used for a cover. */
export const BANNER_FIELDS = ["bannerImage", "banner", "keyArtUrl", "regionBanner"] as const;

/** Where a stored crop rectangle lives for each cover field. */
export const TRIM_FIELDS: Record<string, string> = {
  cartridgeImage: "cartridgeImageTrim",
  coverImage: "coverImageTrim",
  nintendoCardImage: "nintendoCardImageTrim",
};

/**
 * A URL we are willing to render.
 *
 * Import feeds produce `"[object Object]"` when a nested value is stringified,
 * `"undefined"`/`"null"` from template interpolation, and whitespace-only cells
 * from spreadsheets. All three render as a broken image, so they are rejected
 * here rather than at every call site.
 */
export function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (url.length < 3) return false;
  if (/^(?:\[object\s|undefined$|null$|nan$|#|javascript:)/i.test(url)) return false;
  if (url === "[object Object]") return false;
  // Anything else must at least look addressable.
  return /^(?:https?:\/\/|\/|data:image\/)/i.test(url);
}

/** First usable URL from a list-shaped field (strings or `{url}`/`{src}` rows). */
function firstFromList(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (isUsableImageUrl(entry)) return entry.trim();
    if (entry && typeof entry === "object") {
      const row = entry as Record<string, unknown>;
      for (const key of ["url", "src", "imageUrl", "image"]) {
        if (isUsableImageUrl(row[key])) return String(row[key]).trim();
      }
    }
  }
  return null;
}

function pick(
  product: Record<string, unknown>,
  fields: readonly string[],
): { url: string; source: string } | null {
  for (const field of fields) {
    const value = product[field];
    if (isUsableImageUrl(value)) return { url: value.trim(), source: field };
  }
  return null;
}

const PLACEHOLDER: ResolvedImage = {
  url: NINTENDO_IMAGE_PLACEHOLDER,
  source: "placeholder",
  isPlaceholder: true,
};

function withTrim(
  product: Record<string, unknown>,
  hit: { url: string; source: string },
): ResolvedImage {
  const trimField = TRIM_FIELDS[hit.source];
  const trim = trimField ? product[trimField] : undefined;
  return { url: hit.url, source: hit.source, isPlaceholder: false, ...(trim ? { trim } : {}) };
}

/**
 * Resolves the image a given surface should show.
 *
 * Fallback order per usage:
 *
 * - **front-cover / listing-card / bundle-card / cart / toast**
 *   `cartridgeImage → coverImage → coverUrl → box_front_url → image → …`
 *   → placeholder. Galleries and banners are *not* in this chain.
 * - **square-card**
 *   `nintendoCardImage → squareGameImage → front cover → placeholder`.
 *   The front cover is a legitimate last resort here because the card window
 *   frames it rather than stretching it, but a dedicated square asset always
 *   wins so nothing has to be cropped.
 * - **3d-texture**
 *   `coverHiResImage → front cover → placeholder`. Never a thumbnail, never a
 *   gallery frame.
 * - **banner**
 *   `bannerImage → banner → keyArtUrl → gallery` → placeholder. It never falls
 *   back to a cover, just as a cover never falls back to a banner.
 */
export function resolveNintendoImage(
  product: Record<string, unknown> | null | undefined,
  usage: NintendoImageUsage = "front-cover",
): ResolvedImage {
  if (!product || typeof product !== "object") return PLACEHOLDER;

  if (usage === "banner") {
    const hit = pick(product, BANNER_FIELDS);
    if (hit) return withTrim(product, hit);
    const gallery =
      firstFromList(product["galleryImages"]) ??
      firstFromList(product["gallery"]) ??
      firstFromList(product["images"]);
    if (gallery) return { url: gallery, source: "gallery", isPlaceholder: false };
    return PLACEHOLDER;
  }

  if (usage === "square-card") {
    const square = pick(product, SQUARE_CARD_FIELDS);
    if (square) return withTrim(product, square);
    // Fall through to the front cover: the card frames it, never stretches it.
  }

  if (usage === "3d-texture") {
    const hiRes = pick(product, HI_RES_COVER_FIELDS);
    if (hiRes) return withTrim(product, hiRes);
  }

  const cover = pick(product, FRONT_COVER_FIELDS);
  if (cover) return withTrim(product, cover);

  return PLACEHOLDER;
}

/** Convenience wrapper for the common case. */
export function resolveNintendoImageUrl(
  product: Record<string, unknown> | null | undefined,
  usage: NintendoImageUsage = "front-cover",
): string {
  return resolveNintendoImage(product, usage).url;
}

/**
 * The cart, the bundle card and the add-to-cart toast must agree, because the
 * same purchase is shown on all three within a couple of seconds and a mismatch
 * reads as "I added the wrong thing". They share this one entry point.
 */
export function resolvePurchaseImage(
  product: Record<string, unknown> | null | undefined,
): ResolvedImage {
  return resolveNintendoImage(product, "cart");
}

/**
 * Display ratio for a front-cover frame.
 *
 * Fixed rather than derived from the file, so a row of covers is a row of equal
 * rectangles whatever mix of sources it came from. 0.72 is a retail Switch keep
 * case (10.4 × 17.2 cm is 0.60, but store packshots are consistently squarer);
 * with the margin trimmed, artwork fills it with no visible letterbox.
 */
export const COVER_ASPECT_RATIO = 0.72;

/** Display ratio for the compact platform card's artwork window. */
export const SQUARE_CARD_ASPECT_RATIO = 1;
