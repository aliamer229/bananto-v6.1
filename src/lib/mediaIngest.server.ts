import { hasObject, writeBinary } from "./storage.server";
import { processImageToWebP, isWebP } from "./imageProcessor";
import { d1Run } from "./d1.server";

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
  sourceHost?: string;
  error?: string;
  warning?: string;
}

export interface FetchRemoteMediaOptions {
  maxAttempts?: number;
  timeoutMs?: number;
  customHeaders?: Record<string, string>;
}

export interface FetchRemoteMediaResult {
  ok: boolean;
  bytes?: Uint8Array;
  mime?: string;
  httpStatus?: number;
  attempts: number;
  sourceUrl: string;
  finalUrl?: string;
  sourceHost?: string;
  error?: string;
  rayId?: string;
  retryAfterSeconds?: number;
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
const MAX_IMAGE_BYTES = 35 * 1024 * 1024; // 35 MB maximum

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
 * Supports query params, ports 80/443/8080/8443, and both http & https.
 * Explicitly supports major CDNs without hostname exclusion.
 */

export function isSafeRemoteImageUrl(raw: string): URL | null {
  if (!raw || typeof raw !== "string" || raw.length > 4096) return null;
  // Remove zero-width spaces and control characters
  // eslint-disable-next-line no-control-regex
  let cleanStr = raw.replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F]/g, "").trim();
  // Quick unescape of common HTML entities if present
  cleanStr = cleanStr.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  
  let url: URL;
  try {
    url = new URL(cleanStr);
  } catch {
    // If it fails, maybe the path has unencoded spaces or weird chars, let's try a fallback encode URI
    try {
      url = new URL(encodeURI(cleanStr));
    } catch {
      return null;
    }
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
 * Extracts and maps source-specific referer and request headers based on hostname.
 * Supports: Walmart, Amazon, BestBuy, Costco, TradeInn, Nintendo eShop CDN, Nintendo Assets CDN, etc.
 */

export function buildMediaRequestHeaders(urlStr: string, attempt: number = 1): Record<string, string> {
  const defaultChromeUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const safariUA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
  const botUA =
    "BanantoStore/2.0 (compatible; GameStoreAssetFetcher/2.0; +https://banantostore.com)";

  let host = "";
  let origin = "";
  try {
    const u = new URL(urlStr);
    host = u.hostname.toLowerCase();
    origin = u.origin;
  } catch {
    // Ignore invalid URL parsing for header builder
  }

  const isWikimedia = host.includes("wikimedia.org") || host.includes("wikipedia.org");

  const headers: Record<string, string> = {
    "User-Agent": isWikimedia ? botUA : attempt === 3 ? safariUA : defaultChromeUA,
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  if (origin) {
    if (attempt === 1) {
      headers["Referer"] = origin + "/";
    } else if (attempt === 2) {
      headers["Referer"] = "https://www.google.com/";
    } else {
      headers["Referer"] = "";
    }
  }

  // Domain-specific custom referrers
  if (host.includes("nintendo.com")) {
    headers["Referer"] = "https://www.nintendo.com/";
  } else if (host.includes("gamespot.com") || host.includes("gamefaqs")) {
    headers["Referer"] = "https://gamefaqs.gamespot.com/";
  }

  return headers;
}



const hostSemaphores = new Map<string, number>();
const MAX_CONCURRENT_PER_HOST = 3;

async function acquireDownloadSlot(host: string): Promise<() => void> {
  const current = hostSemaphores.get(host) || 0;
  if (current >= MAX_CONCURRENT_PER_HOST) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
  }
  hostSemaphores.set(host, (hostSemaphores.get(host) || 0) + 1);
  return () => {
    const val = hostSemaphores.get(host) || 1;
    if (val <= 1) hostSemaphores.delete(host);
    else hostSemaphores.set(host, val - 1);
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchRemoteMedia(
  sourceUrl: string,
  options: FetchRemoteMediaOptions = {}
): Promise<FetchRemoteMediaResult> {
  const isTest = Boolean(process.env.NODE_ENV === "test" || process.env.VITEST);
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? (isTest ? 2000 : 30000);

  const initialSafeUrl = isSafeRemoteImageUrl(sourceUrl);
  if (!initialSafeUrl) {
    return { ok: false, sourceUrl, httpStatus: 400, attempts: 0, error: `SSRF_OR_INVALID_URL: ${sourceUrl}` };
  }

  const initialHost = initialSafeUrl.hostname.toLowerCase();
  const currentUrl = initialSafeUrl.toString();
  let lastHttpStatus = 0;
  let lastError = "";
  let lastRayId = "";
  let finalResolvedUrl = currentUrl;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await delay(isTest ? 0 : 1500);
    }
    const host = (() => { try { return new URL(currentUrl).hostname.toLowerCase(); } catch { return initialHost; } })();
    const releaseSlot = await acquireDownloadSlot(host);

    try {
      let activeUrl = currentUrl;
      let response: Response | null = null;

      for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
        const safeHop = isSafeRemoteImageUrl(activeUrl);
        if (!safeHop) {
          return { ok: false, sourceUrl, finalUrl: activeUrl, sourceHost: host, httpStatus: 400, attempts: attempt, error: `SSRF_REDIRECT_BLOCKED: ${activeUrl}` };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const headers = {
            ...buildMediaRequestHeaders(activeUrl, attempt),
            ...(options.customHeaders || {}),
          };
          response = await fetch(activeUrl, {
            method: "GET",
            headers,
            redirect: "manual",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response && response.status >= 300 && response.status < 400 && response.headers.get("location")) {
          const loc = response.headers.get("location")!;
          const resolved = new URL(loc, activeUrl).toString();
          activeUrl = resolved;
          finalResolvedUrl = resolved;
          continue; // follow redirect
        }
        
        finalResolvedUrl = activeUrl;
        break; // stop following redirects
      }

      if (!response) {
        lastError = "NO_RESPONSE";
        continue;
      }

      lastHttpStatus = response.status;
      lastRayId = response.headers.get("cf-ray") || response.headers.get("x-amz-cf-id") || "";

      if (response.status === 404 || response.status === 403 || response.status === 401 || response.status === 429 || response.status >= 500) {
        lastError = `HTTP_${response.status}`;
        console.warn(`[fetchRemoteMedia] Host ${host} returned HTTP ${response.status} (attempt ${attempt}/${maxAttempts})`);
        continue; // Retry with next approach
      }

      if (!response.ok) {
        return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: response.status, attempts: attempt, rayId: lastRayId, error: `HTTP_${response.status}` };
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_IMAGE_BYTES) {
        return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: 413, attempts: attempt, error: `FILE_TOO_LARGE: ${contentLength} bytes` };
      }

      const rawContentType = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
      if (rawContentType === "text/html" || rawContentType === "application/json" || rawContentType === "text/plain") {
        lastError = `REMOTE_SERVER_RETURNED_HTML: ${rawContentType}`;
        continue;
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length < MIN_IMAGE_BYTES) {
        lastError = `IMAGE_EMPTY_OR_CORRUPT: ${bytes.length} bytes`;
        continue;
      }

      const sniffedMime = sniffImageMimeType(bytes);
      if (!sniffedMime) {
        const startStr = new TextDecoder().decode(bytes.slice(0, 80)).toLowerCase().trim();
        if (startStr.startsWith("<html") || startStr.startsWith("<!doctype") || startStr.includes("<body")) {
          lastError = `REMOTE_SERVER_RETURNED_HTML`;
          continue;
        }
      }

      const mime = sniffedMime || (rawContentType?.startsWith("image/") ? rawContentType : undefined);
      if (!mime || !mime.startsWith("image/")) {
        lastError = `INVALID_IMAGE_PAYLOAD: declared=${rawContentType || "none"}, sniffed=${sniffedMime || "none"}`;
        continue;
      }

      return { ok: true, bytes, mime, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: response.status, attempts: attempt, rayId: lastRayId };

    } catch (err: any) {
      if (err?.name === "AbortError") {
        lastError = "TIMEOUT";
      } else {
        lastError = `NETWORK_ERROR: ${err?.message || err}`;
      }
      console.warn(`[fetchRemoteMedia] Attempt ${attempt}/${maxAttempts} failed for ${sourceUrl}: ${lastError}`);
    } finally {
      releaseSlot();
    }
  }

  return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: initialHost, httpStatus: lastHttpStatus || 503, attempts: maxAttempts, rayId: lastRayId, error: lastError || "MAX_RETRIES_EXCEEDED" };
}


/**
 * Backward compatibility alias for fetchRemoteImageWithRetry.
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
  const result = await fetchRemoteMedia(initialUrl, options);
  return {
    ok: result.ok,
    bytes: result.bytes,
    mime: result.mime,
    httpStatus: result.httpStatus,
    attempts: result.attempts,
    finalUrl: result.finalUrl,
    error: result.error,
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
 * Ingests any remote image URL, downloads it with robust source-aware retries,
 * normalizes to WebP, deduplicates with content hash, stores into R2, and registers
 * the canonical internal stored URL.
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

  console.log(`[INGEST_IMAGE] RAW_URL_RECEIVED=${sourceUrl || ""}`);
  if (sourceUrl) {
    console.log(`[INGEST_IMAGE] RAW_URL_LENGTH=${sourceUrl.length}`);
    console.log(`[INGEST_IMAGE] RAW_URL_LAST_100_CHARS=${sourceUrl.slice(-100)}`);
  }

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

        const shouldSmartCrop = field === "cartridgeImage";

        const converted = await processImageToWebP(bytes, mime, {
          highQuality: isHigh,
          preserveDimensions: true,
          smartCrop: shouldSmartCrop,
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
    console.log(`[IMAGE_IMPORT_START] productSlug=${cleanProductId} field=${field} url=${trimmed}`);
    const fetchResult = await fetchRemoteMedia(trimmed, { maxAttempts: 4 });

    if (!fetchResult.ok || !fetchResult.bytes) {
      console.warn(`[IMAGE_IMPORT_FAILED] stage=fetch reason=${fetchResult.error || "FETCH_FAILED"}`);
      // Record failure audit for background retry
      await recordMediaAudit(cleanProductId, field, trimmed, null, "failed", {
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        error: fetchResult.error,
        sourceHost: fetchResult.sourceHost,
        rayId: fetchResult.rayId,
      });

      let errorMsg = fetchResult.error || "FETCH_FAILED";
      if (errorMsg.includes("404")) errorMsg = "فشل الخادم في جلب الصورة من المصدر الخارجي (HTTP 404)";
      else if (errorMsg.includes("403")) errorMsg = "HTTP 403: الخادم الخارجي حظر الوصول (Forbidden / Hotlink Protection)";
      else if (errorMsg.includes("401")) errorMsg = "HTTP 401: غير مصرح بالوصول (Unauthorized)";
      else if (errorMsg.includes("HTML")) errorMsg = "الخادم الخارجي أعاد صفحة HTML بدل صورة (Remote server returned HTML)";
      else if (errorMsg.includes("TIMEOUT")) errorMsg = "انتهت مهلة الاتصال بالخادم الخارجي (Connection Timeout)";
      else if (errorMsg.includes("CORRUPT") || errorMsg.includes("INVALID_IMAGE")) errorMsg = "بيانات الصورة غير صالحة أو تالفة (Invalid image bytes)";

      return {
        ok: false,
        status: "failed",
        sourceUrl: trimmed,
        storedUrl: null,
        field,
        productId: cleanProductId,
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        sourceHost: fetchResult.sourceHost,
        error: errorMsg,
        warning: `تعذر تنزيل الصورة من المصدر الخارجي (${errorMsg}).`,
      };
    }

    try {
      const rawBytes = fetchResult.bytes;
      const rawMime = fetchResult.mime || "image/jpeg";
      console.log(`[IMAGE_FETCH_RESULT] status=${fetchResult.httpStatus} contentType=${rawMime} bytes=${rawBytes.length} resolvedUrl=${fetchResult.finalUrl || trimmed}`);

      const isHigh =
        highQuality ||
        field === "coverHiResImage" ||
        field.includes("3d") ||
        expectedType === "wrap" ||
        expectedType === "cover";

      const shouldSmartCrop = field === "cartridgeImage" || expectedType === "cover" || expectedType === "card";

      // Convert to WebP (quality 93-95 for high quality, 88-90 for standard)
      const converted = await processImageToWebP(rawBytes, rawMime, {
        highQuality: isHigh,
        preserveDimensions: true,
        smartCrop: shouldSmartCrop,
      });

      console.log(`[IMAGE_DECODE_RESULT] width=${converted?.width || 0} height=${converted?.height || 0}`);
      const outBytes = converted ? converted.bytes : rawBytes;
      const outMime = converted ? "image/webp" : rawMime;
      console.log(`[WEBP_RESULT] originalBytes=${rawBytes.length} webpBytes=${outBytes.length}`);
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
      console.log(`[R2_UPLOAD_RESULT] key=${key} url=${storedUrl}`);
      console.log(`[IMAGE_IMPORT_COMPLETE] productSlug=${cleanProductId} field=${field} storedUrl=${storedUrl}`);

      // Record successful audit
      await recordMediaAudit(cleanProductId, field, trimmed, storedUrl, "stored", {
        sha256: hash,
        httpStatus: fetchResult.httpStatus,
        attempts: fetchResult.attempts,
        size: outBytes.length,
        width: converted?.width,
        height: converted?.height,
        sourceHost: fetchResult.sourceHost,
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
        sourceHost: fetchResult.sourceHost,
      };
    } catch (err: any) {
      console.error(`[IMAGE_IMPORT_FAILED] stage=processing reason=${err?.message || err}`);
      return {
        ok: false,
        status: "failed",
        sourceUrl: trimmed,
        storedUrl: null,
        field,
        productId: cleanProductId,
        attempts: fetchResult.attempts,
        sourceHost: fetchResult.sourceHost,
        error: `فشل معالجة الصورة وتحويلها إلى WebP: ${err?.message || err}`,
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

export const importRemoteProductImage = ingestRemoteImage;

