import type { Product, AccountBundle } from "./types";

export interface TranslationResult {
  titleAr?: string;
  titleEn?: string;
  titleKu?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  descriptionKu?: string;
  badgeAr?: string;
  badgeEn?: string;
  badgeKu?: string;
  featuresEn?: string[];
  featuresKu?: string[];
  genreEn?: string;
  genreKu?: string;
}

const translationCache = new Map<string, string>();

/**
 * Direct, fast translation using Google Translate public endpoint (no AI model / zero latency overhead).
 */
export async function translateText(
  text: string,
  targetLang: "ar" | "ckb" | "en" | "ku",
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const cacheKey = `${targetLang}:${trimmed}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      trimmed,
    )}`;
    const response = await fetch(url);
    if (!response.ok) {
      return trimmed;
    }
    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((item: any) => item?.[0] || "").join("")
      : "";

    if (translated) {
      translationCache.set(cacheKey, translated);
      return translated;
    }
    return trimmed;
  } catch (err) {
    console.error(`Automatic translation error to ${targetLang}:`, err);
    return trimmed;
  }
}

/**
 * Translates content between English, Arabic and Kurdish (Central Kurdish / Sorani)
 * without requiring any AI API key.
 */
export async function translateProductContent(data: {
  title?: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  badge?: string;
  features?: string[];
  genre?: string;
}): Promise<TranslationResult> {
  const sourceTitle = (data.titleEn || data.title || "").trim();
  const sourceDesc = (data.descriptionEn || data.description || "").trim();

  const [titleAr, titleKu, descAr, descKu, badgeAr, badgeKu, genreAr, genreKu] = await Promise.all([
    Promise.resolve(""), // Skip translating titles
    Promise.resolve(""), // Skip translating titles
    sourceDesc ? translateText(sourceDesc, "ar") : Promise.resolve(""),
    sourceDesc ? translateText(sourceDesc, "ckb") : Promise.resolve(""),
    data.badge ? translateText(data.badge, "ar") : Promise.resolve(""),
    data.badge ? translateText(data.badge, "ckb") : Promise.resolve(""),
    data.genre ? translateText(data.genre, "ar") : Promise.resolve(""),
    data.genre ? translateText(data.genre, "ckb") : Promise.resolve(""),
  ]);

  let featuresEn: string[] | undefined;
  let featuresKu: string[] | undefined;
  if (data.features && data.features.length > 0) {
    featuresEn = data.features;
    featuresKu = await Promise.all(data.features.map((f) => translateText(f, "ckb")));
  }

  return {
    titleAr: titleAr || sourceTitle,
    titleEn: sourceTitle,
    titleKu: titleKu || sourceTitle,
    descriptionAr: descAr || sourceDesc,
    descriptionEn: sourceDesc,
    descriptionKu: descKu || sourceDesc,
    badgeAr: badgeAr || data.badge,
    badgeEn: data.badge,
    badgeKu: badgeKu || data.badge,
    featuresEn,
    featuresKu,
    genreEn: data.genre,
    genreKu: genreKu || data.genre,
  };
}

/**
 * Automatically translates a product when saved.
 * The input is assumed to be in English (matching the import template standard).
 * Generates Arabic and Kurdish fields automatically without AI.
 */
export async function autoTranslateProduct(product: Product): Promise<Product> {
  const sourceTitle = (product.titleEn || product.title || "").trim();
  const sourceDesc = (product.descriptionEn || product.description || "").trim();

  if (!sourceTitle && !sourceDesc) {
    return product;
  }

  try {
    const result = await translateProductContent({
      title: sourceTitle,
      titleEn: sourceTitle,
      description: sourceDesc,
      descriptionEn: sourceDesc,
      badge: (product.badge as string) || undefined,
      features: product.features,
      genre: product.genre,
    });

    return {
      ...product,
      title: sourceTitle, // explicitly keep English title as the main title
      titleEn: sourceTitle,
      titleKu: result.titleKu || sourceTitle,
      description: result.descriptionAr || product.description || sourceDesc,
      descriptionEn: sourceDesc,
      descriptionKu: result.descriptionKu || sourceDesc,
      genreEn: result.genreEn || (product.genreEn as string),
      genreKu: result.genreKu || (product.genreKu as string),
      badgeEn: result.badgeEn || (product.badgeEn as string),
      badgeKu: result.badgeKu || (product.badgeKu as string),
      featuresEn: result.featuresEn || (product.featuresEn as string[]),
      featuresKu: result.featuresKu || (product.featuresKu as string[]),
    };
  } catch (err) {
    console.error("autoTranslateProduct error:", err);
    return {
      ...product,
      titleEn: sourceTitle,
      descriptionEn: sourceDesc,
    };
  }
}

/**
 * Automatically translates an AccountBundle when saved.
 * Generates Arabic and Kurdish fields automatically from English input without AI.
 */
export async function autoTranslateBundle(bundle: AccountBundle): Promise<AccountBundle> {
  const sourceTitle = (bundle.titleEn || bundle.title || "").trim();
  const sourceDesc = (bundle.descriptionEn || bundle.description || "").trim();

  if (!sourceTitle && !sourceDesc) {
    return bundle;
  }

  try {
    const result = await translateProductContent({
      title: sourceTitle,
      titleEn: sourceTitle,
      description: sourceDesc,
      descriptionEn: sourceDesc,
      badge: bundle.badge,
      features: bundle.features,
    });

    return {
      ...bundle,
      title: result.titleAr || bundle.title || sourceTitle,
      titleEn: sourceTitle,
      titleKu: result.titleKu || sourceTitle,
      description: result.descriptionAr || bundle.description || sourceDesc,
      descriptionEn: sourceDesc,
      descriptionKu: result.descriptionKu || sourceDesc,
      badgeEn: result.badgeEn || bundle.badgeEn,
      badgeKu: result.badgeKu || bundle.badgeKu,
      featuresEn: result.featuresEn || bundle.featuresEn,
      featuresKu: result.featuresKu || bundle.featuresKu,
    };
  } catch (err) {
    console.error("autoTranslateBundle error:", err);
    return {
      ...bundle,
      titleEn: sourceTitle,
      descriptionEn: sourceDesc,
    };
  }
}
