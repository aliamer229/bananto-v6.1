import { slugifyDevice } from "./devicePerformance";
import { normalizeName, slugifyTitle } from "./gameData/identity";

/**
 * Finds a product in the list by matching either its ID or any slug variation.
 */
export function findProductByIdOrSlug(
  products: any[] | undefined,
  idOrSlug: string | undefined,
): any | undefined {
  if (!products || !idOrSlug) return undefined;
  const raw = String(idOrSlug).trim();
  const decoded = decodeURIComponent(raw).trim().toLowerCase();

  // 1. Exact ID match
  const byId = products.find((p) => String(p.id) === raw || String(p.id).toLowerCase() === decoded);
  if (byId) return byId;

  // 2. Direct slug field match
  const bySlug = products.find((p) => p.slug && String(p.slug).toLowerCase() === decoded);
  if (bySlug) return bySlug;

  // 3. Device slug match (for hardware/accessories)
  const targetDeviceSlug = slugifyDevice(decoded);
  if (targetDeviceSlug) {
    const byDeviceSlug = products.find((p) => {
      const pSlug = slugifyDevice(p.slug || p.title || p.shortName || p.titleEn || "");
      return pSlug && pSlug === targetDeviceSlug;
    });
    if (byDeviceSlug) return byDeviceSlug;
  }

  // 4. Title slug match (for games)
  const targetTitleSlug = slugifyTitle(decoded);
  if (targetTitleSlug) {
    const byTitleSlug = products.find((p) => {
      const pTitle = slugifyTitle(p.titleEn || p.english_name || p.title || "");
      return pTitle && pTitle === targetTitleSlug;
    });
    if (byTitleSlug) return byTitleSlug;
  }

  // 5. Normalized name match
  const targetNorm = normalizeName(decoded);
  if (targetNorm) {
    const byNorm = products.find((p) => {
      return normalizeName(p.titleEn || p.english_name || p.title || "") === targetNorm;
    });
    if (byNorm) return byNorm;
  }

  return undefined;
}

/**
 * Generates the canonical URL slug for any product.
 */
export function getProductSlug(product: any): string {
  if (!product) return "";
  if (product.slug) return String(product.slug);
  const deviceSlug = slugifyDevice(product.titleEn || product.english_name || product.title || "");
  if (deviceSlug) return deviceSlug;
  const titleSlug = slugifyTitle(product.titleEn || product.english_name || product.title || "");
  if (titleSlug) return titleSlug;
  return String(product.id || "");
}

/**
 * Generates the canonical route path for a product.
 */
export function getProductPath(product: any): string {
  if (!product) return "/";
  const slug = getProductSlug(product) || String(product.id || "");
  return `/product/${encodeURIComponent(slug)}`;
}
