import type { Lang } from "./prefs";
import type { Product, AccountBundle } from "./types";

/**
 * Returns the localized title of a product or bundle based on active language.
 */
export function getLocalizedTitle(
  item: { title?: string; titleEn?: string; titleKu?: string } | null | undefined,
  lang: Lang,
): string {
  if (!item) return "";
  if (lang === "en") {
    return item.titleEn || item.title || "";
  }
  if (lang === "ku") {
    return item.titleKu || item.titleEn || item.title || "";
  }
  // Default to Arabic
  return item.title || item.titleEn || "";
}

/**
 * Returns the localized description based on active language.
 */
export function getLocalizedDescription(
  item: { description?: string; descriptionEn?: string; descriptionKu?: string } | null | undefined,
  lang: Lang,
): string {
  if (!item) return "";
  if (lang === "en") {
    return item.descriptionEn || item.description || "";
  }
  if (lang === "ku") {
    return item.descriptionKu || item.descriptionEn || item.description || "";
  }
  return item.description || item.descriptionEn || "";
}

/**
 * Returns localized features list.
 */
export function getLocalizedFeatures(
  item: { features?: string[]; featuresEn?: string[]; featuresKu?: string[] } | null | undefined,
  lang: Lang,
): string[] {
  if (!item) return [];
  if (lang === "en" && item.featuresEn && item.featuresEn.length > 0) {
    return item.featuresEn;
  }
  if (lang === "ku" && item.featuresKu && item.featuresKu.length > 0) {
    return item.featuresKu;
  }
  return item.features || item.featuresEn || [];
}

/**
 * Returns localized badge string.
 */
export function getLocalizedBadge(
  item: { badge?: string; badgeEn?: string; badgeKu?: string } | null | undefined,
  lang: Lang,
): string | undefined {
  if (!item || !item.badge) return undefined;
  if (lang === "en") return item.badgeEn || item.badge;
  if (lang === "ku") return item.badgeKu || item.badgeEn || item.badge;
  return item.badge;
}

/**
 * Returns localized genre or category name.
 */
export function getLocalizedGenre(
  item: { genre?: string; genreEn?: string; genreKu?: string } | null | undefined,
  lang: Lang,
): string {
  if (!item || !item.genre) return "";
  if (lang === "en") return item.genreEn || item.genre;
  if (lang === "ku") return item.genreKu || item.genreEn || item.genre;
  return item.genre;
}

/**
 * Returns localized banner text (title, subtitle, badge).
 */
export function getLocalizedBanner(
  banner: any,
  lang: Lang,
): { title: string; subtitle?: string; buttonText?: string; badge?: string } {
  if (!banner) return { title: "" };
  if (lang === "en") {
    return {
      title: banner.titleEn || banner.title || "",
      subtitle: banner.subtitleEn || banner.subtitle,
      buttonText: banner.buttonTextEn || banner.buttonText,
      badge: banner.badgeEn || banner.badge,
    };
  }
  if (lang === "ku") {
    return {
      title: banner.titleKu || banner.titleEn || banner.title || "",
      subtitle: banner.subtitleKu || banner.subtitleEn || banner.subtitle,
      buttonText: banner.buttonTextKu || banner.buttonTextEn || banner.buttonText,
      badge: banner.badgeKu || banner.badgeEn || banner.badge,
    };
  }
  return {
    title: banner.title || banner.titleEn || "",
    subtitle: banner.subtitle,
    buttonText: banner.buttonText,
    badge: banner.badge,
  };
}
