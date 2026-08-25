import { createFileRoute } from "@tanstack/react-router";

import { guard } from "@/lib/http.server";
import { fetchRemoteImage, readLimitedBody, safeRemoteImageUrl } from "@/lib/security.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 12 * 1024 * 1024;
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
  if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "image/avif";
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  // Fallback to URL extension
  const clean = (fallbackUrl.split("?")[0] || "").toLowerCase();
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".gif")) return "image/gif";

  return "image/jpeg";
}

/**
 * High-performance edge image proxy & dynamic format optimizer.
 * Handles AVIF (preferred), WebP (fallback), width constraints, and immutable caching.
 */
export const Route = createFileRoute("/api/img")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          const url = new URL(request.url);
          const remote = url.searchParams.get("u") ?? "";
          const targetWidth = Math.min(2400, Math.max(0, parseInt(url.searchParams.get("w") || "0", 10)));
          const formatParam = (url.searchParams.get("format") || "").toLowerCase();
          const targetQuality = Math.min(100, Math.max(40, parseInt(url.searchParams.get("q") || "85", 10)));

          const safeUrl = safeRemoteImageUrl(remote);
          if (!safeUrl) return new Response("Bad request", { status: 400 });

          const throttle = await consumeRateLimit(
            request,
            "image-proxy",
            2400,
            60 * 60,
            safeUrl.hostname,
          );
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

          const acceptHeader = request.headers.get("accept") || "";
          const prefersAvif = formatParam === "avif" || (!formatParam && acceptHeader.includes("image/avif"));
          const prefersWebp = formatParam === "webp" || (!formatParam && acceptHeader.includes("image/webp"));

          const res = await fetchRemoteImage(safeUrl.toString(), {
            headers: {
              accept: "image/avif,image/webp,image/*,*/*;q=0.8",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (!res?.ok) return new Response("Upstream error", { status: 502 });
          const rawBuffer = await readLimitedBody(res, MAX_BYTES);
          if (!rawBuffer) return new Response("Image too large", { status: 413 });

          let finalBuffer: Uint8Array = rawBuffer;
          let mime = detectMime(rawBuffer, safeUrl.toString(), res.headers.get("content-type"));

          // Perform smart Sharp dynamic optimization if needed (width resize or format conversion)
          try {
            const sharpModule = await import("sharp");
            const sharp = sharpModule.default || sharpModule;
            if (typeof sharp === "function" && mime !== "image/gif") {
              let pipeline = sharp(rawBuffer, { failOnError: false }).rotate();

              if (targetWidth > 0) {
                pipeline = pipeline.resize({ width: targetWidth, fit: "inside", withoutEnlargement: true });
              }

              if (prefersAvif) {
                const avifBuf = await pipeline.avif({ quality: targetQuality, effort: 4 }).toBuffer();
                finalBuffer = new Uint8Array(avifBuf);
                mime = "image/avif";
              } else if (prefersWebp) {
                const webpBuf = await pipeline.webp({ quality: targetQuality, effort: 4, smartSubsample: true }).toBuffer();
                finalBuffer = new Uint8Array(webpBuf);
                mime = "image/webp";
              } else if (targetWidth > 0) {
                const outBuf = await pipeline.toBuffer();
                finalBuffer = new Uint8Array(outBuf);
              }
            }
          } catch (transformErr) {
            // Silently fallback to raw upstream image
          }

          const isImmutable = url.searchParams.has("v") || url.searchParams.has("h") || safeUrl.pathname.includes("/v/");
          const cacheControl = isImmutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=604800, stale-while-revalidate=2592000";

          return new Response(finalBuffer as unknown as BodyInit, {
            headers: {
              "content-type": mime,
              "cache-control": cacheControl,
              "x-image-proxy": "edge-optimizer",
              "x-content-type-options": "nosniff",
              "content-security-policy": "default-src 'none'; sandbox",
              vary: "Accept",
            },
          });
        }),
    },
  },
});
