import { createFileRoute } from "@tanstack/react-router";
import { fetchRemoteImage, readLimitedBody, safeRemoteImageUrl } from "@/lib/security.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 8 * 1024 * 1024;

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
              Referer: "https://www.nintendolife.com/",
              Accept: "image/*",
            },
          });

          if (!res?.ok) return new Response("Upstream Error", { status: 502 });
          const mime = res.headers.get("Content-Type") || "";
          if (!/^image\/(?:png|jpeg|webp|gif|avif)$/i.test(mime)) {
            return new Response("Unsupported", { status: 415 });
          }

          const buffer = await readLimitedBody(res, MAX_BYTES);
          if (!buffer) return new Response("Image too large", { status: 413 });
          return new Response(buffer as unknown as BodyInit, {
            headers: {
              "Content-Type": mime,
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return new Response("Image proxy failed", { status: 502 });
        }
      },
    },
  },
});
