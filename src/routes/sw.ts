import { createFileRoute } from "@tanstack/react-router";
// The service worker source is bundled as text and served by the Cloudflare
// Worker itself, so we control its headers (scope, content type, caching).
import source from "../../public/sw.js?raw";

export const Route = createFileRoute("/sw")({
  server: {
    handlers: {
      GET: async () =>
        new Response(source as string, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            // Allow the worker to control the whole origin.
            "service-worker-allowed": "/",
            // Never let a stale service worker linger on the edge or client.
            "cache-control": "no-cache, no-store, must-revalidate",
          },
        }),
    },
  },
});
