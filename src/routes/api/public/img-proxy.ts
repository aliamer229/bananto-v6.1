import { createFileRoute } from "@tanstack/react-router";
import { fetchRemoteImage, readLimitedBody, safeRemoteImageUrl } from "@/lib/security.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 8 * 1024 * 1024;
// SVG is deliberately excluded: it is an active document, so echoing one
// back from our own origin would be a script-execution primitive on
// banan.to for any attacker-supplied URL.
const ALLOWED = /^image\/(?:png|jpeg|webp|gif|avif)$/i;

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
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  const clean = (fallbackUrl.split("?")[0] || "").toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".avif")) return "image/avif";

  return "image/jpeg";
}

export const Route = createFileRoute("/api/public/img-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        if (!url || !safeRemoteImageUrl(url)) return new Response("Bad URL", { status: 400 });
        const throttle = await consumeRateLimit(request, "public-image-proxy", 120, 60 * 60);
        if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

        try {
          const res = await fetchRemoteImage(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/*,*/*;q=0.8",
            },
          });

          if (!res?.ok) return new Response("Upstream Error", { status: 502 });
          const buffer = await readLimitedBody(res, MAX_BYTES);
          if (!buffer) return new Response("Image too large", { status: 413 });
          const mime = detectMime(buffer, url, res.headers.get("Content-Type"));

          return new Response(buffer as unknown as BodyInit, {
            headers: {
              "Content-Type": mime,
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
              // Defence in depth: this body is attacker-controlled and served
              // from our own origin, so it must never execute as a document.
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'; sandbox",
            },
          });
        } catch {
          return new Response("Image proxy failed", { status: 502 });
        }
      },
    },
  },
});
