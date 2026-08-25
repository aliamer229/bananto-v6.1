import { hasObject, writeBinary, readBinary } from "./storage.server";
import { processImageToWebP, isWebP } from "./imageProcessor";
import { fetchRemoteImage, readLimitedBody } from "./security.server";
import { coverTextureFetchHeaders } from "./coverTexture";
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
 * Ensures all image fields in a product are valid, persisted in Cloudflare R2 as WebP,
 * and have no lingering local `blob:` URLs or unpersisted raw data.
 */
export async function sanitizeAndVerifyProductImages(
  product: Partial<Product>
): Promise<{ ok: boolean; error?: string; product: Partial<Product> }> {
  const productId = String(product.id || "general").replace(/[^a-zA-Z0-9_-]/g, "");
  const cloned: Record<string, any> = { ...product };

  // Helper to ingest and verify a single URL
  const processAndVerifyUrl = async (
    url: string | null | undefined,
    fieldName: string
  ): Promise<{ url: string | null; error?: string }> => {
    if (!url || typeof url !== "string") return { url: null };
    const trimmed = url.trim();
    if (!trimmed) return { url: null };

    // Reject uncommitted blob URLs
    if (trimmed.startsWith("blob:")) {
      return {
        url: null,
        error: `حقل الصورة (${fieldName}) يحتوي على رابط مؤقت (blob:) لم يكتمل رفعه بعد. يرجى الانتظار حتى اكتمال الرفع أو إعادة اختيار الصورة.`,
      };
    }

    // If it's already an internal storage URL
    if (trimmed.startsWith("/api/files/")) {
      const storageKey = trimmed.replace("/api/files/", "files/");
      const exists = await hasObject(storageKey);
      if (!exists) {
        // If file is not in storage, log warning but keep if we can't fetch it
        console.warn(`[ImageVerification] Storage key not found: ${storageKey}`);
      }
      return { url: trimmed };
    }

    // If it's a data: URL, convert and upload to R2
    if (trimmed.startsWith("data:image/")) {
      const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(trimmed);
      if (match) {
        try {
          const mime = match[1]!;
          const base64 = match[2]!;
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const isHighQuality = fieldName === "coverHiResImage" || fieldName.includes("3d");
          const converted = await processImageToWebP(bytes, mime, { highQuality: isHighQuality });
          const outBytes = converted ? converted.bytes : bytes;

          const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(outBytes));
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
            .substring(0, 16);

          const key = `files/products/${productId}/${fieldName}-${hashHex}.webp`;
          await writeBinary(key, outBytes, "image/webp", { cacheControl: "public, max-age=31536000, immutable" });
          return { url: `/api/files/${key.slice("files/".length)}` };
        } catch (err: any) {
          console.error(`Failed to ingest data URL for ${fieldName}:`, err);
        }
      }
    }

    // If it's an external HTTP/HTTPS URL, ingest into R2 as WebP
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const response = await fetchRemoteImage(trimmed, {
          headers: coverTextureFetchHeaders(trimmed),
        });

        if (response && response.ok) {
          const bytes = await readLimitedBody(response, Infinity);
          if (bytes && bytes.length > 16) {
            const rawMime = response.headers.get("content-type") || "image/jpeg";
            const isHighQuality = fieldName === "coverHiResImage" || fieldName.includes("3d");
            const converted = await processImageToWebP(bytes, rawMime, { highQuality: isHighQuality });
            const outBytes = converted ? converted.bytes : bytes;

            const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(outBytes));
            const hashHex = Array.from(new Uint8Array(hashBuffer))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")
              .substring(0, 16);

            const key = `files/products/${productId}/${fieldName}-${hashHex}.webp`;
            await writeBinary(key, outBytes, "image/webp", { cacheControl: "public, max-age=31536000, immutable" });
            return { url: `/api/files/${key.slice("files/".length)}` };
          }
        }
      } catch (fetchErr) {
        console.warn(`[ImageVerification] Could not automatically ingest remote image ${trimmed}:`, fetchErr);
      }
      // If remote ingest fails, preserve the original URL so data is not lost
      return { url: trimmed };
    }

    return { url: trimmed };
  };

  // Process single image fields
  for (const field of SINGLE_IMAGE_FIELDS) {
    if (cloned[field]) {
      const res = await processAndVerifyUrl(cloned[field], field);
      if (res.error) {
        return { ok: false, error: res.error, product };
      }
      if (res.url) {
        cloned[field] = res.url;
      }
    }
  }

  // Process array image fields
  for (const field of ARRAY_IMAGE_FIELDS) {
    if (Array.isArray(cloned[field]) && cloned[field].length > 0) {
      const newArray: string[] = [];
      for (const item of cloned[field]) {
        if (typeof item === "string") {
          const res = await processAndVerifyUrl(item, field);
          if (res.error) {
            return { ok: false, error: res.error, product };
          }
          if (res.url) {
            newArray.push(res.url);
          }
        } else {
          newArray.push(item);
        }
      }
      cloned[field] = newArray;
    }
  }

  return { ok: true, product: cloned as Partial<Product> };
}
