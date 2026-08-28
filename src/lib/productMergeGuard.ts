/**
 * A partial product save must never erase the fields it does not mention.
 *
 * The admin editor sends only the fields it believes changed. When the object
 * it diffed against was a listing projection rather than the stored document,
 * every rich field the form defaulted to empty — `bannerImages: [""]`,
 * `gallery: []`, `nintendoCardImage: ""` — arrived looking like a deliberate
 * clear, and the server spread it over the stored product. Nothing in the
 * request distinguished that from an admin genuinely removing an image.
 *
 * So the server stops trusting emptiness as intent. A key that is absent keeps
 * its stored value, and a key that arrives empty over a non-empty stored value
 * is refused unless the request names it in `_clear`. Refusals are returned to
 * the caller and logged, never applied silently.
 */

import type { Product } from "./types";

/** Every image role, kept apart. Losing one must not be masked by another. */
export const PROTECTED_IMAGE_FIELDS = [
  "image",
  "banner",
  "cartridgeImage",
  "nintendoCardImage",
  "coverImage",
  "coverHiResImage",
  "squareGameImage",
  "packagingFrontImage",
  "boxImage",
  "cardArtwork",
  "mainImage",
  "modelTextureUrl",
] as const;

/** Collections whose emptying costs the storefront a whole section. */
export const PROTECTED_COLLECTION_FIELDS = [
  "bannerImages",
  "gallery",
  "galleryImages",
  "galleryDetails",
  "screenshots",
  "variants",
  "options",
  "editions",
  "editionOptions",
  "editionsList",
  "dlcs",
  "dlc",
  "devicePerformance",
  "performance",
  "nintendo",
  "switch2",
  "overview",
  "story",
  "gameplayPillars",
  "multiplayer",
  "languagesInfo",
  "timeline",
  "updates",
  "music",
  "guides",
  "faq",
  "reviews",
  "sources",
  "similarGamesInfo",
  "seriesInfo",
  "studioInfo",
  "completion",
  "storage",
  "verdict",
  "videos",
  "features",
  "genres",
  "supportedLanguages",
] as const;

const PROTECTED = new Set<string>([...PROTECTED_IMAGE_FIELDS, ...PROTECTED_COLLECTION_FIELDS]);

/** How much is in this value. Empty strings, `[]`, `{}` and `[""]` are all nothing. */
export function contentSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? 1 : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) return value.filter((item) => contentSize(item) > 0).length;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => contentSize(item) > 0)
      ? 1
      : 0;
  }
  return 0;
}

export interface BlockedField {
  field: string;
  from: number;
  to: number;
}

export interface MergeResult {
  merged: Product;
  /** Fields the patch tried to empty without saying so. None of them applied. */
  blocked: BlockedField[];
  /** Fields the patch cleared with explicit intent. */
  cleared: string[];
  /** Fields the patch actually changed. */
  changed: string[];
}

export interface MergeOptions {
  /**
   * Fields the caller means to empty — the `deleteImage` / `deleteVariant` /
   * `clearPerformance` intent, named per field. Only these may go to zero.
   */
  clear?: readonly string[];
}

/**
 * Applies `patch` onto `stored`, refusing silent destruction.
 *
 * Absent key  → stored value survives.
 * Empty value over empty stored value → applied, nothing is lost.
 * Empty value over non-empty stored value → refused, unless named in `clear`.
 */
export function mergeProductUpdate(
  stored: Product,
  patch: Partial<Product>,
  options: MergeOptions = {},
): MergeResult {
  const clear = new Set((options.clear ?? []).map(String));
  const merged: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  const blocked: BlockedField[] = [];
  const cleared: string[] = [];
  const changed: string[] = [];

  for (const [field, incoming] of Object.entries(patch)) {
    // An explicitly undefined key is the same as an absent one: no opinion.
    if (incoming === undefined) continue;

    const before = contentSize((stored as Record<string, unknown>)[field]);
    const after = contentSize(incoming);

    if (PROTECTED.has(field) && before > 0 && after === 0 && !clear.has(field)) {
      blocked.push({ field, from: before, to: after });
      continue;
    }

    if (before > 0 && after === 0 && clear.has(field)) cleared.push(field);

    const same =
      JSON.stringify((stored as Record<string, unknown>)[field]) === JSON.stringify(incoming);
    if (!same) changed.push(field);
    merged[field] = incoming;
  }

  return { merged: merged as Product, blocked, cleared, changed };
}

/** The log line an operator can grep for after a refused save. */
export function destructiveUpdateLog(productId: string, blocked: readonly BlockedField[]): string {
  const detail = blocked.map((b) => `${b.field}:${b.from}->${b.to}`).join(",");
  return `DESTRUCTIVE_PRODUCT_UPDATE_BLOCKED product=${productId} fields=${blocked.length} ${detail}`;
}
