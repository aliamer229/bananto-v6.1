import { createFileRoute } from "@tanstack/react-router";

/**
 * Image proxy for news thumbnails. Some feeds block hotlinking (referrer
 * checks) which makes the <img> render blank in the app, so the picture is
 * fetched server-side from a small allowlist of news CDNs and re-served.
 */
const ALLOWED_HOSTS = [
  "images.nintendolife.com",
  "nintendolife.com",
  "www.nintendolife.com",
  "nintendoeverything.com",
  "www.nintendoeverything.com",
  "gonintendo.com",
  "www.gonintendo.com",
  "images.pushsquare.com",
  "assets.nintendo.com",
  "www.nintendo.com",
  "cdn.mos.cms.futurecdn.net",
];

export const Route = createFileRoute("/api/public/news-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") || "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
          return new Response("forbidden host", { status: 403 });
        }

        try {
          const upstream = await fetch(target.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
              Referer: `https://${target.hostname}/`,
            },
            signal: AbortSignal.timeout(8000),
          });
          if (!upstream.ok || !upstream.body) {
            return new Response("upstream error", { status: 502 });
          }
          const type = upstream.headers.get("content-type") || "image/jpeg";
          if (!type.startsWith("image/")) return new Response("not an image", { status: 415 });

          return new Response(upstream.body, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
          });
        } catch {
          return new Response("fetch failed", { status: 502 });
        }
      },
    },
  },
});
