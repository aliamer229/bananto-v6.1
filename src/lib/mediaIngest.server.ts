import { hasObject, writeBinary } from "./storage.server";
import { processImageToWebP, isWebP } from "./imageProcessor";
import { d1Run } from "./d1.server";
import { coverTextureFetchHeaders } from "./coverTexture";

export interface RemoteImageIngestOptions {
  sourceUrl: string;
  productId: string;
  field: string;
  index?: number;
  expectedType?:
    | "cover"
    | "cartridge"
    | "card"
    | "wrap"
    | "banner"
    | "gallery"
    | "gameplay"
    | "story"
    | "general";
  highQuality?: boolean;
  maxRetries?: number;
  generateSquareDerivative?: boolean;
}

export interface IngestResult {
  ok: boolean;
  status: "stored" | "failed" | "skipped" | "cached";
  sourceUrl: string;
  storedUrl: string | null;
  field: string;
  productId: string;
  sha256?: string;
  mime?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  httpStatus?: number;
  attempts: number;
  error?: string;
  warning?: string;
}

const MIME_EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/heif": "heif",
};

const MIN_IMAGE_BYTES = 16;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30 MB maximum

/**
 * Sniffs image bytes against known file signatures (magic numbers).
 */
export function sniffImageMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length < 4) return undefined;

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF .... WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // GIF: GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // BMP: 42 4D ('BM')
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  // TIFF: II*. or MM.*
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return "image/tiff";
  }
  // AVIF / HEIC / HEIF: ftyp at offset 4
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "image/avif";
  }

  return undefined;
}

/**
 * Checks whether an IPv4 address is in a private, loopback, or link-local range.
 */
function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const octets = parts.map(Number);
  if (octets.some((p) => p < 0 || p > 255)) return true;

  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a! >= 224) return true; // Multicast / reserved
  return false;
}

/**
 * SSRF Safety validation: guarantees URL targets public internet only.
 * Supports query params, ports 80/443, and both http & https.
 */
export function isSafeRemoteImageUrl(raw: string): URL | null {
  if (!raw || typeof raw !== "string" || raw.length > 4096) return null;
  const trimmed = raw.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const port = url.port;
  if (port && port !== "80" && port !== "443" && port !== "8080" && port !== "8443") {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254" ||
    isPrivateOrReservedIpv4(host) ||
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc00:") ||
    host.startsWith("fd00:")
  ) {
    return null;
  }

  return url;
}

/**
 * Generates realistic browser request headers based on target domain.
 */
export function buildMediaRequestHeaders(urlStr: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    Accept:
      "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  };

  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host === "thecoverproject.net" || host.endsWith(".thecoverproject.net")) {
      headers["Referer"] = "https://www.thecoverproject.net/";
    } else if (host.includes("nintendo.com") || host.includes("nintendoswitch.com")) {
      headers["Referer"] = "https://www.nintendo.com/";
    } else if (host.includes("cloudinary.com")) {
      headers["Referer"] = "https://www.nintendo.com/";
    } else if (host.includes("ign.com")) {
      headers["Referer"] = "https://www.ign.com/";
    } else {
      headers["Referer"] = `${new URL(urlStr).origin}/`;
    }
  } catch {
    // ignore
  }

  return headers;
}

/**
 * Sleep helper for retry backoffs.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parses Retry-After header (either seconds or HTTP-Date), capped to a safe maximum.
 */
function parseRetryAfter(headerValue: string | null, maxMs = 4000): number {
  if (!headerValue) return 0;
  const parsedSeconds = Number(headerValue);
  if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
    return Math.min(parsedSeconds * 1000, maxMs);
  }
  const parsedDate = Date.parse(headerValue);
  if (!isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return diff > 0 ? Math.min(diff, maxMs) : 0;
  }
  return 0;
}

/**
 * Safely fetches remote image with exponential backoff on 503, 429, 502, 504, 500, 408, 425
 * and follows redirects up to 5 hops with SSRF validation.
 */
export async function fetchRemoteImageWithRetry(
  initialUrl: string,
  options: { maxAttempts?: number; timeoutMs?: number } = {}
): Promise<{
  ok: boolean;
  bytes?: Uint8Array;
  mime?: string;
  httpStatus?: number;
  attempts: number;
  finalUrl?: string;
  error?: string;
}> {
  const maxAttempts = options.maxAttempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 14000;
  const backoffSchedule = [0, 500, 1500, 3000];

  const currentUrl = initialUrl;
  let lastHttpStatus = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Apply backoff if not first attempt
    const waitTime = backoffSchedule[attempt - 1] ?? 3000;
    if (waitTime > 0) {
      await delay(waitTime);
    }

    // SSRF verification
    const safeUrl = isSafeRemoteImageUrl(currentUrl);
    if (!safeUrl) {
      return {
        ok: false,
        httpStatus: 400,
        attempts: attempt,
        error: `SSRF_OR_INVALID_URL: ${currentUrl}`,
      };
    }

    try {
      let activeUrl = safeUrl.toString();
      let response: Response | null = null;

      // Handle up to 5 redirects manually to check SSRF on each hop
      for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const headers = buildMediaRequestHeaders(activeUrl);
          response = await fetch(activeUrl, {
            method: "GET",
            headers,
            redirect: "manual",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Handle redirect
        if (
          response &&
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get("location")
        ) {
          const loc = response.headers.get("location")!;
          const resolved = new URL(loc, activeUrl).toString();
          const safeHop = isSafeRemoteImageUrl(resolved);
          if (!safeHop) {
            return {
              ok: false,
              httpStatus: response.status,
              attempts: attempt,
              error: `SSRF_REDIRECT_BLOCKED: ${resolved}`,
            };
          }
          activeUrl = safeHop.toString();
          continue;
        }

        // Final response reached
        break;
      }

      if (!response) {
        lastError = "NO_RESPONSE";
        continue;
      }

      lastHttpStatus = response.status;

      // Check for transient retryable HTTP status codes
      const retryableStatuses = [408, 425, 429, 500, 502, 503, 504];
      if (retryableStatuses.includes(response.status)) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = parseRetryAfter(retryAfterHeader, 4000);
        if (retryAfterMs > 0 && attempt < maxAttempts) {
          await delay(retryAfterMs);
        }
        lastError = `HTTP_${response.status}`;
        continue;
      }

      // Check for non-2xx status
      if (!response.ok) {
        return {
          ok: false,
          httpStatus: response.status,
          attempts: attempt,
          error: `HTTP_${response.status}`,
        };
      }

      // Read response body with size limit
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_IMAGE_BYTES) {
        return {
          ok: false,
          httpStatus: 413,
          attempts: attempt,
          error: `FILE_TOO_LARGE: ${contentLength} bytes`,
        };
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length < MIN_IMAGE_BYTES) {
        return {
          ok: false,
          httpStatus: 200,
          attempts: attempt,
          error: `IMAGE_EMPTY_OR_CORRUPT: ${bytes.length} bytes`,
        };
      }

      // Validate declared or sniffed MIME type
      const declaredMime = (response.headers.get("content-type") || "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      const sniffedMime = sniffImageMimeType(bytes);

      const mime = sniffedMime || (declaredMime?.startsWith("image/") ? declaredMime : undefined);

      if (!mime || !mime.startsWith("image/")) {
        // If external website returned an HTML error page or block page with 200 OK
        return {
          ok: false,
          httpStatus: 200,
          attempts: attempt,
          error: `INVALID_IMAGE_PAYLOAD: declared=${declaredMime || "none"}, sniffed=${sniffedMime || "none"}`,
        };
      }

      return {
        ok: true,
        bytes,
        mime,
        httpStatus: response.status,
        attempts: attempt,
        finalUrl: activeUrl,
      };
    } catch (err: any) {
      lastError = err?.name === "AbortError" ? "TIMEOUT" : String(err?.message || err);
      // Continue to next attempt
    }
  }

  return {
    ok: false,
    httpStatus: lastHttpStatus || 503,
    attempts: maxAttempts,
    error: lastError || "MAX_RETRIES_EXCEEDED",
  };
}

/**
 * Computes hexadecimal SHA-256 string for content deduplication.
 */
async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Writes or updates media audit record in D1.
 */
async function recordMediaAudit(
  productId: string,
  field: string,
  sourceUrl: string,
  storedUrl: string | null,
  status: "stored" | "failed" | "pending",
  details: Record<string, any>
) {
  try {
    const id = `img_${productId}_${field.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const domain = (() => {
      try {
        return new URL(sourceUrl).hostname;
      } catch {
        return "external";
      }
    })();

    await d1Run(
      `INSERT INTO game_images (
        id, game_id, kind, url, source_name, source_url, verified, confidence, evidence, created_at, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        verified = excluded.verified,
        evidence = excluded.evidence,
        verified_at = excluded.verified_at`,
      id,
      productId,
      field,
      storedUrl || sourceUrl,
      domain,
      sourceUrl,
      status === "stored" ? 1 : 0,
      status === "stored" ? 1.0 : 0.0,
      JSON.stringify(details),
      new Date().toISOString(),
      status === "stored" ? new Date().toISOString() : null
    );
  } catch (err) {
    // Non-blocking logging
    console.warn("[recordMediaAudit] Could not write media audit log:", err);
  }
}

/**
 * UNIFIED MEDIA INGESTION ENGINE:
 * Ingests any remote image URL, downloads it with robust retries, normalizes to WebP,
 * deduplicates with content hash, stores into R2, and registers canonical stored URL.
 *
 * CRITICAL ISOLATION RULE:
 * This function NEVER throws an unhandled exception. It always returns an IngestResult.
 */
export async function ingestRemoteImage(options: RemoteImageIngestOptions): Promise<IngestResult> {
  const {
    sourceUrl,
    productId,
    field,
    index,
    expectedType = "general",
    highQuality = false,
  } = options;

  const cleanProductId = String(productId || "general").replace(/[^a-zA-Z0-9_-]/g, "");

  if (!sourceUrl || typeof sourceUrl !== "string") {
    return {
      ok: false,
      status: "skipped",
      sourceUrl: sourceUrl || "",
      storedUrl: null,
      field,
      productId: cleanProductId,
      attempts: 0,
      error: "EMPTY_SOURCE_URL",
    };
  }

  const trimmed = sourceUrl.trim();

  // 1. If already an internal stored URL (/api/files/...)
  if (trimmed.startsWith("/api/files/")) {
    const storageKey = trimmed.replace("/api/files/", "files/");
    const exists = await hasObject(storageKey).catch(() => false);
    return {
      ok: true,
      status: exists ? "stored" : "cached",
      sourceUrl: trimmed,
      storedUrl: trimmed,
      field,
      productId: cleanProductId,
      attempts: 0,
    };
  }

  // 2. If it's a data:image/ base64 URL
  if (trimmed.startsWith("data:image/")) {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(trimmed);
    if (match) {
      try {
        const mime = match[1]!;
        const base64 = match[2]!;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const isHigh =
          highQuality ||
          field === "coverHiResImage" ||
          expectedType === "wrap" ||
          expectedType === "cover";

        const converted = await processImageToWebP(bytes, mime, {
          highQuality: isHigh,
          preserveDimensions: true,
        });
        const outBytes = converted ? converted.bytes : bytes;
        const hash = (await computeSha256(outBytes)).substring(0, 16);

        const folder = expectedType === "gallery" ? "gallery" : field;
        const key = `files/products/${cleanProductId}/${folder}-${hash}.webp`;

        const exists = await hasObject(key).catch(() => false);
        if (!exists) {
          await writeBinary(key, outBytes, "image/webp", {
            cacheControl: "public, max-age=31536000, immutable",
          });
        }

        const storedUrl = `/api/files/${key.slice("files/".length)}`;
        await recordMediaAudit(cleanProductId, field, "data:image/base64", storedUrl, "stored", {
          size: outBytes.length,
          hash,
        });

        return {
          ok: true,
          status: "stored",
          sourceUrl: "data:image/base64",
          storedUrl,
          field,
          productId: cleanProductId,
          sha256: hash,
          mime: "image/webp",
          sizeBytes: outBytes.length,
          width: converted?.width,
          height: converted?.height,
          attempts: 1,
        };
      } catch (err: any) {
        return {
          ok: false,
          status: "failed",
          sourceUrl: "data:image/base64",
          storedUrl: null,
          field,
          productId: cleanProductId,
          attempts: 1,
          error: `DATA_URL_PROCESSING_FAILED: ${err?.message || err}`,
        };
      }
    }
  }

  // 3. Reject unresolved blob: URLs gracefully
  if (trimmed.startsWith("blob:")) {
    return {
      ok: false,
      status: "failed",
      sourceUrl: trimmed,
      storedUrl: null,
      field,
      productId: cleanProductId,
      attempts: 0,
      error: "UNRESOLVED_BLOB_URL",
      warning: `حقل الصورة (${field}) يحتوي على رابط مؤقت (blob:) لم يكتمل رفعه.`,
    };
  }

  // 4. If it's an external HTTP/HTTPS URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const fetchResult = await fetchRemoteImageWithRetry(trimmed, { maxAttempts: 4 });

    if (!fetchResult.ok || !fetchResult.bytes) {
      // Record failure audit for background retry
      await recordMediaAudit(cleanProductId, field, trimmed, null, "failed", {
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        error: fetchResult.error,
      });

      return {
        ok: false,
        status: "failed",
        sourceUrl: trimmed,
        storedUrl: null, // Keep null so caller knows internal store failed, but product continues
        field,
        productId: cleanProductId,
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        error: fetchResult.error || "FETCH_FAILED",
        warning: `تعذر تنزيل الصورة من المصدر الخارجي (${fetchResult.error})، سيتم حفظ بيانات المنتج وإبقاء الرابط متاحاً.`,
      };
    }

    try {
      const rawBytes = fetchResult.bytes;
      const rawMime = fetchResult.mime || "image/jpeg";

      const isHigh =
        highQuality ||
        field === "coverHiResImage" ||
        field.includes("3d") ||
        expectedType === "wrap" ||
        expectedType === "cover";

      // Convert to WebP (quality 92-95 for high quality, 88-90 for standard)
      const converted = await processImageToWebP(rawBytes, rawMime, {
        highQuality: isHigh,
        preserveDimensions: true,
      });

      const outBytes = converted ? converted.bytes : rawBytes;
      const outMime = converted ? "image/webp" : rawMime;
      const hash = (await computeSha256(outBytes)).substring(0, 16);

      const ext = outMime === "image/webp" ? "webp" : MIME_EXT_MAP[outMime] || "bin";
      const folder =
        expectedType === "gallery"
          ? "gallery"
          : index !== undefined
            ? `${field}-${index}`
            : field;
      const key = `files/products/${cleanProductId}/${folder}-${hash}.${ext}`;

      // Deduplication: if exact content hash exists in R2, reuse it immediately
      const alreadyExists = await hasObject(key).catch(() => false);
      if (!alreadyExists) {
        await writeBinary(key, outBytes, outMime, {
          cacheControl: "public, max-age=31536000, immutable",
        });

        // Read-after-write verification
        const verified = await hasObject(key).catch(() => false);
        if (!verified) {
          console.warn(`[ingestRemoteImage] Storage write verification failed for ${key}`);
        }
      }

      const storedUrl = `/api/files/${key.slice("files/".length)}`;

      // Record successful audit
      await recordMediaAudit(cleanProductId, field, trimmed, storedUrl, "stored", {
        sha256: hash,
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        size: outBytes.length,
        width: converted?.width,
        height: converted?.height,
      });

      return {
        ok: true,
        status: "stored",
        sourceUrl: trimmed,
        storedUrl,
        field,
        productId: cleanProductId,
        sha256: hash,
        mime: outMime,
        sizeBytes: outBytes.length,
        width: converted?.width,
        height: converted?.height,
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
      };
    } catch (err: any) {
      console.error(`[ingestRemoteImage] Processing failed for ${trimmed}:`, err);
      return {
        ok: false,
        status: "failed",
        sourceUrl: trimmed,
        storedUrl: null,
        field,
        productId: cleanProductId,
        attempts: fetchResult.attempts,
        error: `IMAGE_CONVERSION_FAILED: ${err?.message || err}`,
      };
    }
  }

  // Any other non-http string is returned as-is
  return {
    ok: true,
    status: "skipped",
    sourceUrl: trimmed,
    storedUrl: trimmed,
    field,
    productId: cleanProductId,
    attempts: 0,
  };
}
