import { createFileRoute } from "@tanstack/react-router";

import { guard } from "@/lib/http.server";
import { fetchRemoteImage, readLimitedBody, safeRemoteImageUrl } from "@/lib/security.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^image\/(?:png|jpeg|webp|gif|avif)$/i;

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
              accept: "image/*",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: "https://www.nintendolife.com/",
            },
          });
          if (!res?.ok) return new Response("Upstream error", { status: 502 });
          const mime = res.headers.get("content-type") ?? "image/jpeg";
          if (!ALLOWED.test(mime)) return new Response("Unsupported", { status: 415 });
          const buffer = await readLimitedBody(res, MAX_BYTES);
          if (!buffer) return new Response("Image too large", { status: 413 });
          return new Response(buffer as unknown as BodyInit, { headers: cacheHeaders(mime) });
        }),
    },
  },
});
