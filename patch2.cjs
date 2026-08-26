const fs = require('fs');
let code = fs.readFileSync('src/lib/mediaIngest.server.ts', 'utf8');

// Replace buildMediaRequestHeaders
const newHeadersBuilder = `
export function buildMediaRequestHeaders(urlStr: string, attempt: number = 1): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  try {
    const urlObj = new URL(urlStr);
    
    if (attempt === 1) {
      headers["Referer"] = urlObj.origin + "/";
    } else if (attempt === 2) {
      // minimal headers
      delete headers["User-Agent"];
      delete headers["Accept-Language"];
      delete headers["Cache-Control"];
      delete headers["Pragma"];
      delete headers["Referer"];
    } else if (attempt >= 3) {
      headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
      headers["Referer"] = "https://www.google.com/";
    }
  } catch (e) {}

  return headers;
}
`;

code = code.replace(/export function buildMediaRequestHeaders[\s\S]*?(?=\nexport async function fetchRemoteMedia)/, newHeadersBuilder + '\n');

// Replace fetchRemoteMedia
const newFetch = `
export async function fetchRemoteMedia(
  sourceUrl: string,
  options: FetchRemoteMediaOptions = {}
): Promise<FetchRemoteMediaResult> {
  const isTest = Boolean(process.env.NODE_ENV === "test" || process.env.VITEST);
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? (isTest ? 2000 : 30000);

  const initialSafeUrl = isSafeRemoteImageUrl(sourceUrl);
  if (!initialSafeUrl) {
    return { ok: false, sourceUrl, httpStatus: 400, attempts: 0, error: \`SSRF_OR_INVALID_URL: \${sourceUrl}\` };
  }

  const initialHost = initialSafeUrl.hostname.toLowerCase();
  let currentUrl = initialSafeUrl.toString();
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
          return { ok: false, sourceUrl, finalUrl: activeUrl, sourceHost: host, httpStatus: 400, attempts: attempt, error: \`SSRF_REDIRECT_BLOCKED: \${activeUrl}\` };
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
        lastError = \`HTTP_\${response.status}\`;
        console.warn(\`[fetchRemoteMedia] Host \${host} returned HTTP \${response.status} (attempt \${attempt}/\${maxAttempts})\`);
        continue; // Retry with next approach
      }

      if (!response.ok) {
        return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: response.status, attempts: attempt, rayId: lastRayId, error: \`HTTP_\${response.status}\` };
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_IMAGE_BYTES) {
        return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: 413, attempts: attempt, error: \`FILE_TOO_LARGE: \${contentLength} bytes\` };
      }

      const rawContentType = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
      if (rawContentType === "text/html" || rawContentType === "application/json" || rawContentType === "text/plain") {
        lastError = \`REMOTE_SERVER_RETURNED_HTML: \${rawContentType}\`;
        continue;
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length < MIN_IMAGE_BYTES) {
        lastError = \`IMAGE_EMPTY_OR_CORRUPT: \${bytes.length} bytes\`;
        continue;
      }

      const sniffedMime = sniffImageMimeType(bytes);
      if (!sniffedMime) {
        const startStr = new TextDecoder().decode(bytes.slice(0, 80)).toLowerCase().trim();
        if (startStr.startsWith("<html") || startStr.startsWith("<!doctype") || startStr.includes("<body")) {
          lastError = \`REMOTE_SERVER_RETURNED_HTML\`;
          continue;
        }
      }

      const mime = sniffedMime || (rawContentType?.startsWith("image/") ? rawContentType : undefined);
      if (!mime || !mime.startsWith("image/")) {
        lastError = \`INVALID_IMAGE_PAYLOAD: declared=\${rawContentType || "none"}, sniffed=\${sniffedMime || "none"}\`;
        continue;
      }

      return { ok: true, bytes, mime, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: host, httpStatus: response.status, attempts: attempt, rayId: lastRayId };

    } catch (err: any) {
      if (err?.name === "AbortError") {
        lastError = "TIMEOUT";
      } else {
        lastError = \`NETWORK_ERROR: \${err?.message || err}\`;
      }
      console.warn(\`[fetchRemoteMedia] Attempt \${attempt}/\${maxAttempts} failed for \${sourceUrl}: \${lastError}\`);
    } finally {
      releaseSlot();
    }
  }

  return { ok: false, sourceUrl, finalUrl: finalResolvedUrl, sourceHost: initialHost, httpStatus: lastHttpStatus || 503, attempts: maxAttempts, rayId: lastRayId, error: lastError || "MAX_RETRIES_EXCEEDED" };
}
`;

code = code.replace(/export async function fetchRemoteMedia[\s\S]*?(?=\n\/\*\*[\s\n]*\* Backward compatibility alias)/, newFetch + '\n');
fs.writeFileSync('src/lib/mediaIngest.server.ts', code);
