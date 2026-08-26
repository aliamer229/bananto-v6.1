import { createFileRoute } from "@tanstack/react-router";
import { safeRemoteImageUrl } from "@/lib/security.server";

/**
 * Image proxy for news thumbnails. Fetches public image URLs server-side
 * with safe headers and re-serves them cleanly.
 */
export const Route = createFileRoute("/api/public/news-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") || "";
        const target = safeRemoteImageUrl(raw);
        if (!target) {
          return new Response("bad or forbidden url", { status: 400 });
        }

        try {
          const upstream = await fetch(target.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
              Referer: `${target.origin}/`,
            },
            signal: AbortSignal.timeout(8000),
          });
          if (!upstream.ok || !upstream.body) {
            return new Response("upstream error", { status: 502 });
          }
          const type = upstream.headers.get("content-type") || "image/jpeg";
          // SVG is an active document; re-serving one from our origin would let
          // a compromised feed CDN run script on banan.to.
          if (!/^image\/(?:png|jpeg|webp|gif|avif)\b/i.test(type)) {
            return new Response("not an image", { status: 415 });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'; sandbox",
            },
          });
        } catch {
          return new Response("fetch failed", { status: 502 });
        }
      },
    },
  },
});
