import { ingestRemoteImage, type IngestResult } from "./mediaIngest.server";
import type { Product } from "./types";

export const SINGLE_IMAGE_FIELDS = [
  "coverImage",
  "cartridgeImage",
  "nintendoCardImage",
  "coverHiResImage",
  "banner",
  "bannerImage",
  "image",
  "cardArtwork",
  "mainImage",
  "frontCover",
  "backCover",
  "spineCover",
] as const;

export const ARRAY_IMAGE_FIELDS = [
  "gallery",
  "screenshots",
  "hardwareImages",
  "accessoriesImages",
  "bannerImages",
  "amiiboImages",
  "usedImages",
  "bundleImages",
] as const;

/**
 * Ensures all image fields in a product are ingested into Cloudflare R2 as WebP,
 * and canonical internal URLs are stored.
 *
 * CRITICAL ISOLATION GUARANTEE:
 * Media download/network errors (HTTP 503, 403, 429, timeouts, etc.) will NEVER
 * cause this function to return ok: false or fail the product import/save.
 * If remote media fails, the product data saves normally with the original URL preserved
 * and a warning recorded.
 */
export async function sanitizeAndVerifyProductImages(
  product: Partial<Product>
): Promise<{
  ok: boolean;
  error?: string;
  product: Partial<Product>;
  warnings?: string[];
  results?: IngestResult[];
}> {
  const productId = String(product.id || "general").replace(/[^a-zA-Z0-9_-]/g, "");
  const cloned: Record<string, any> = { ...product };
  const warnings: string[] = [];
  const results: IngestResult[] = [];

  // Helper to ingest and verify a single URL
  const processAndVerifyUrl = async (
    url: string | null | undefined,
    fieldName: string,
    index?: number
  ): Promise<string | null> => {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Clean uncommitted blob URLs without blocking the save
    if (trimmed.startsWith("blob:")) {
      warnings.push(`حقل الصورة (${fieldName}) يحتوي على رابط مؤقت (blob:) تم استبعاده.`);
      return null;
    }

    const isHighQuality =
      fieldName === "coverHiResImage" ||
      fieldName.includes("3d") ||
      fieldName === "cartridgeImage";

    const result = await ingestRemoteImage({
      sourceUrl: trimmed,
      productId,
      field: fieldName,
      index,
      expectedType: fieldName.includes("gallery")
        ? "gallery"
        : fieldName === "coverHiResImage"
          ? "wrap"
          : "general",
      highQuality: isHighQuality,
    });

    results.push(result);

    if (result.ok && result.storedUrl) {
      return result.storedUrl;
    }

    if (result.warning) {
      warnings.push(result.warning);
    }

    // Never drop or break the image field if download was temporarily unavailable;
    // preserve the original URL so data is not lost and can be repaired later.
    return trimmed;
  };

  // 1. Process single image fields concurrently
  const singlePromises = SINGLE_IMAGE_FIELDS.map(async (field) => {
    if (cloned[field] && typeof cloned[field] === "string") {
      const processedUrl = await processAndVerifyUrl(cloned[field], field);
      cloned[field] = processedUrl || "";
    }
  });

  // 2. Process array image fields concurrently
  const arrayPromises = ARRAY_IMAGE_FIELDS.map(async (field) => {
    if (Array.isArray(cloned[field]) && cloned[field].length > 0) {
      const newArray = await Promise.all(
        cloned[field].map(async (item: any, idx: number) => {
          if (typeof item === "string") {
            const processedUrl = await processAndVerifyUrl(item, field, idx + 1);
            return processedUrl || item;
          } else if (item && typeof item === "object" && typeof item.imageUrl === "string") {
            const processedUrl = await processAndVerifyUrl(item.imageUrl, `${field}_screenshot`, idx + 1);
            return { ...item, imageUrl: processedUrl || item.imageUrl };
          }
          return item;
        })
      );
      cloned[field] = newArray.filter(Boolean);
    }
  });

  // 3. Process nested structures concurrently
  const nestedPromises: Promise<void>[] = [];

  if (Array.isArray(cloned.gameplayPillars)) {
    nestedPromises.push(
      (async () => {
        await Promise.all(
          cloned.gameplayPillars.map(async (pillar: any, idx: number) => {
            if (pillar && typeof pillar.image === "string") {
              const processedUrl = await processAndVerifyUrl(pillar.image, "gameplayPillar", idx + 1);
              if (processedUrl) pillar.image = processedUrl;
            }
          })
        );
      })()
    );
  }

  if (cloned.story && Array.isArray(cloned.story.chapters)) {
    nestedPromises.push(
      (async () => {
        await Promise.all(
          cloned.story.chapters.map(async (ch: any, idx: number) => {
            if (ch && typeof ch.image === "string") {
              const processedUrl = await processAndVerifyUrl(ch.image, "storyChapter", idx + 1);
              if (processedUrl) ch.image = processedUrl;
            }
          })
        );
      })()
    );
  }

  if (Array.isArray(cloned.dlcs)) {
    nestedPromises.push(
      (async () => {
        await Promise.all(
          cloned.dlcs.map(async (dlc: any, idx: number) => {
            if (dlc && typeof dlc.image === "string") {
              const processedUrl = await processAndVerifyUrl(dlc.image, "dlc", idx + 1);
              if (processedUrl) dlc.image = processedUrl;
            }
          })
        );
      })()
    );
  }

  if (Array.isArray(cloned.editions)) {
    nestedPromises.push(
      (async () => {
        await Promise.all(
          cloned.editions.map(async (ed: any, idx: number) => {
            if (ed && typeof ed.cover === "string") {
              const processedUrl = await processAndVerifyUrl(ed.cover, "editionCover", idx + 1);
              if (processedUrl) ed.cover = processedUrl;
            }
          })
        );
      })()
    );
  }

  await Promise.all([...singlePromises, ...arrayPromises, ...nestedPromises]);

  // 4. Ensure automatic square derivative fallback if nintendoCardImage is missing but cartridgeImage/coverImage exists
  if (!cloned.nintendoCardImage) {
    if (cloned.cartridgeImage) {
      cloned.nintendoCardImage = cloned.cartridgeImage;
    } else if (cloned.coverImage) {
      cloned.nintendoCardImage = cloned.coverImage;
    }
  }

  return {
    ok: true,
    product: cloned as Partial<Product>,
    warnings: warnings.length > 0 ? warnings : undefined,
    results,
  };
}
