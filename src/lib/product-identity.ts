/**
 * When two products are the same product.
 *
 * The catalogue used to be protected only by slug uniqueness, and the slug is
 * built by stripping everything outside `[a-z0-9]`. For an English title that
 * mostly works. For an Arabic one it strips the entire title, the slug falls
 * back to `product-<id>` — unique by construction — and the same game can be
 * added over and over, each copy with its own id, its own stock and its own
 * orders. Two products differing only in case, in a trailing space, in "!!"
 * versus "!", or in which alef was typed, slipped through the same way.
 *
 * ## The key
 *
 * A product's identity is its **normalised title plus its platform**. The same
 * game on Switch 1 and on Switch 2 is genuinely two products; the same game
 * typed twice is not.
 *
 * Normalisation is deliberately aggressive about noise and careful about
 * meaning:
 *
 * - Unicode NFKC first, so full-width and composed forms compare equal.
 * - Zero-width and directional marks removed — they are invisible, and a title
 *   pasted from a supplier is full of them.
 * - Arabic tashkeel removed and alef / yaa / taa-marbuta folded, because
 *   "الأسطورة" and "الاسطورة" are the same word to everyone but a byte
 *   comparison.
 * - Trademark symbols dropped, `&` read as "and".
 * - Runs of punctuation collapsed to a single space, then runs of whitespace
 *   collapsed to one.
 *
 * What it does **not** do is strip non-Latin characters. `normalizeName` in
 * `gameData/identity.ts` does, which is why it cannot be used here: every
 * Arabic title normalises to the empty string under it, which would make every
 * Arabic product a duplicate of every other.
 */

/** Diacritics, zero-width characters and directional marks. */
const ARABIC_TASHKEEL = /[\u064B-\u0652\u0670\u0653-\u0655\u0656-\u065F\u06D6-\u06ED]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const TRADEMARKS = /[™®©]/g;
/** Anything that separates words rather than carrying meaning. */
const PUNCTUATION = /[\p{P}\p{S}]+/gu;

export function normalizeProductTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  /*
    Trademark symbols go first: NFKC expands ™ to the letters "TM", so
    stripping afterwards would leave "deluxetm" and a product would collide
    with nothing.
  */
  let value = raw.replace(TRADEMARKS, "").normalize("NFKC").toLowerCase();
  value = value.replace(INVISIBLE, "");
  value = value.replace(/&/g, " and ");
  value = value.replace(ARABIC_TASHKEEL, "");
  // Fold the Arabic letters that are typed interchangeably.
  value = value
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "");
  value = value.replace(PUNCTUATION, " ");
  return value.replace(/\s+/g, " ").trim();
}

/** Canonical platform key. Unknown or missing reads as `switch1`, the default. */
export function normalizeProductPlatform(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return "switch1";
  if (value === "both" || value === "dual") return "both";
  if (value.includes("switch2") || value.includes("switch 2")) return "switch2";
  if (value.includes("switch")) return "switch1";
  return value.replace(/\s+/g, "-");
}

export interface ProductIdentityInput {
  id?: string | number | null;
  title?: string | null;
  titleEn?: string | null;
  platform?: string | null;
}

/**
 * The key two products must not share.
 *
 * Both title columns are considered: a product added in Arabic and the same one
 * re-added in English are still the same game, and either title colliding is
 * enough to say so.
 */
export function productIdentityKeys(product: ProductIdentityInput): string[] {
  const platform = normalizeProductPlatform(product.platform);
  const titles = [product.title, product.titleEn]
    .map(normalizeProductTitle)
    .filter((title) => title.length > 0);
  return [...new Set(titles)].map((title) => `${platform}::${title}`);
}

/** The single key stored alongside the product; the primary title wins. */
export function productIdentityKey(product: ProductIdentityInput): string | null {
  return productIdentityKeys(product)[0] ?? null;
}

export interface DuplicateGroup {
  key: string;
  normalizedTitle: string;
  platform: string;
  products: { id: string; title: string; platform: string }[];
}

/**
 * Every set of products that share an identity, for a report.
 *
 * Reporting only. Nothing here removes, merges or edits anything: a duplicate
 * may already carry orders, bundle membership, favourites, reviews, cart rows
 * and uploaded artwork, and deciding which copy keeps them is a judgement a
 * person has to make. The list is ordered so the oldest entry — the one most
 * likely to own that history — comes first in each group.
 */
export function findDuplicateProducts(
  products: readonly ProductIdentityInput[] | null | undefined,
): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  for (const product of products ?? []) {
    const id = product?.id === undefined || product?.id === null ? "" : String(product.id);
    if (!id) continue;
    for (const key of productIdentityKeys(product)) {
      const [platform = "", normalizedTitle = ""] = key.split("::");
      let group = groups.get(key);
      if (!group) {
        group = { key, normalizedTitle, platform, products: [] };
        groups.set(key, group);
      }
      // A product whose two titles normalise the same is not its own duplicate.
      if (group.products.some((entry) => entry.id === id)) continue;
      group.products.push({
        id,
        title: String(product.title ?? product.titleEn ?? ""),
        platform,
      });
    }
  }

  return [...groups.values()].filter((group) => group.products.length > 1);
}

/**
 * The product already in the catalogue under this identity, if any.
 *
 * `selfId` is the product being saved: editing a product must not report it as
 * a duplicate of itself.
 */
export function findConflictingProduct<T extends ProductIdentityInput>(
  candidate: ProductIdentityInput,
  catalogue: readonly T[] | null | undefined,
  selfId?: string,
): T | null {
  const keys = new Set(productIdentityKeys(candidate));
  if (keys.size === 0) return null;

  for (const existing of catalogue ?? []) {
    const id = existing?.id === undefined || existing?.id === null ? "" : String(existing.id);
    if (!id || (selfId && id === String(selfId))) continue;
    if (productIdentityKeys(existing).some((key) => keys.has(key))) return existing;
  }
  return null;
}
