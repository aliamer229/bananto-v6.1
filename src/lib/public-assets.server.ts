/**
 * Public Cloudflare R2 Asset Management.
 *
 * Dedicated strictly to BANANTO_BUCKET (assets.banan.to).
 * Used exclusively for public storefront images, UI sounds, and streaming radio tracks.
 */

import { getBinding } from "./env.server";
import { type R2Like, safeStorageKey } from "./storage.server";
import { randomId } from "./crypto.server";

export const ALLOWED_PUBLIC_PREFIXES = [
  "Images/Services/",
  "Images/Pages/",
  "Images/Banners/",
  "Images/Icons/",
  "Audio/Ui/",
  "Audio/Music/",
  "Documents/Public/",
] as const;

export const ALLOWED_PUBLIC_MIMES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

export function getPublicBucket(): R2Like | undefined {
  const bucket = getBinding<R2Like>("BANANTO_BUCKET");
  if (bucket && typeof bucket.get === "function") return bucket;

  const globalEnv = (globalThis as { __CF_ENV__?: Record<string, unknown> }).__CF_ENV__;
  const globalBucket = globalEnv?.["BANANTO_BUCKET"] as R2Like | undefined;
  if (globalBucket && typeof globalBucket.get === "function") return globalBucket;

  return undefined;
}

export function isAllowedPublicPrefix(prefix: string): boolean {
  return ALLOWED_PUBLIC_PREFIXES.some((allowed) => prefix.startsWith(allowed));
}

export function validatePublicAssetMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/webp") {
    const riff = new TextDecoder().decode(bytes.slice(0, 4));
    const webp = new TextDecoder().decode(bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  if (mime === "audio/webm" || mime === "video/webm") {
    // Matroska / WebM EBML header ID: 0x1A 0x45 0xDF 0xA3
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  if (mime === "audio/mpeg") {
    // ID3 header or sync frame 0xFF 0xFB/F3/F2
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
    return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
  }
  if (mime === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  return false;
}

export async function uploadPublicAsset(params: {
  folder: string;
  bytes: Uint8Array;
  mime: string;
  customFilename?: string;
}): Promise<{ key: string; url: string }> {
  const { folder, bytes, mime, customFilename } = params;

  if (!isAllowedPublicPrefix(folder)) {
    throw new Error("INVALID_PUBLIC_FOLDER");
  }

  const ext = ALLOWED_PUBLIC_MIMES[mime];
  if (!ext) {
    throw new Error("UNSUPPORTED_PUBLIC_MIME");
  }

  if (!validatePublicAssetMagic(bytes, mime)) {
    throw new Error("FILE_SIGNATURE_MISMATCH");
  }

  const cleanName = customFilename
    ? customFilename.replace(/[^a-zA-Z0-9._-]/g, "")
    : `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomId("pub")}.${ext}`;

  const key = `${folder}${cleanName}`;
  if (!safeStorageKey(key)) throw new Error("INVALID_STORAGE_KEY");

  const bucket = getPublicBucket();
  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }

  return {
    key,
    url: `https://assets.banan.to/${key}`,
  };
}

export async function listPublicAssets(prefix: string) {
  if (!isAllowedPublicPrefix(prefix) && prefix !== "") {
    throw new Error("INVALID_PUBLIC_PREFIX");
  }
  const bucket = getPublicBucket();
  if (!bucket) return [];
  const result = await bucket.list({ prefix, limit: 100 });
  return result.objects;
}

export async function deletePublicAsset(key: string): Promise<boolean> {
  if (!safeStorageKey(key)) return false;
  if (!isAllowedPublicPrefix(key)) {
    throw new Error("CANNOT_DELETE_OUTSIDE_ALLOWED_PREFIX");
  }
  const bucket = getPublicBucket();
  if (bucket) {
    await bucket.delete(key);
    return true;
  }
  return false;
}
