import { createFileRoute } from "@tanstack/react-router";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/debug-products")({
  server: {
    handlers: {
      GET: notFound,
      POST: notFound,
    },
  },
});
