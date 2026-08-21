import { createFileRoute } from "@tanstack/react-router";

import { guard } from "@/lib/http.server";
import { fetchRemoteImage, readLimitedBody, safeRemoteImageUrl } from "@/lib/security.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/i;

function detectMime(buffer: Uint8Array, fallbackUrl: string, headerMime?: string | null): string {
  if (headerMime && ALLOWED.test(headerMime)) {
    return headerMime;
  }

  // Sniff magic bytes
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  // Fallback to URL extension
  const clean = (fallbackUrl.split("?")[0] || "").toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".svg")) return "image/svg+xml";

  // If the host is a known image CDN or the buffer has non-trivial size, default to image/jpeg
  return "image/jpeg";
}

/**
 * Edge image proxy. The Worker cache stores successful responses, while
 * attacker-chosen URLs are never persisted permanently into R2.
 */
export const Route = createFileRoute("/api/img")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const url = new URL(request.url);
          const remote = url.searchParams.get("u") ?? "";
          const safeUrl = safeRemoteImageUrl(remote);
          if (!safeUrl) return new Response("Bad request", { status: 400 });
          // Catalogue pages can legitimately request hundreds of thumbnails
          // from the same host, so the budget has to be generous or real
          // product images start disappearing behind 429s.
          const throttle = await consumeRateLimit(
            request,
            "image-proxy",
            1200,
            60 * 60,
            safeUrl.hostname,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

          const cacheHeaders = (mime: string) => ({
            "content-type": mime,
            "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            "x-image-proxy": "edge",
          });

          const res = await fetchRemoteImage(safeUrl.toString(), {
            headers: {
              accept: "image/*,*/*;q=0.8",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (!res?.ok) return new Response("Upstream error", { status: 502 });
          const buffer = await readLimitedBody(res, MAX_BYTES);
          if (!buffer) return new Response("Image too large", { status: 413 });
          const mime = detectMime(buffer, safeUrl.toString(), res.headers.get("content-type"));
          return new Response(buffer as unknown as BodyInit, { headers: cacheHeaders(mime) });
        }),
    },
  },
});
