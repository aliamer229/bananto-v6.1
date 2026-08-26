import { createFileRoute } from "@tanstack/react-router";

import { guard } from "@/lib/http.server";
import { readBinaryStream, readBinary } from "@/lib/storage.server";
import { getSessionUser } from "@/lib/session.server";

export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        guard(async () => {
          const path = (params as { _splat?: string })._splat ?? "";
          if (
            !/^(?:[a-z0-9_-]{1,64}\/)*[a-z0-9_-]{1,96}\.(?:png|jpe?g|webp|gif|avif|pdf|mp4|webm|mov)$/i.test(
              path,
            )
          ) {
            return new Response("Not found", { status: 404 });
          }

          // Sensitive user folders that require authentication (wallets, orders, receipts, documents, support, chat, uploads)
          const isPrivateFolder =
            /^(chat|uploads|wallets|orders|support|receipts|documents)\//i.test(path);

          if (isPrivateFolder) {
            const viewer = await getSessionUser(request);
            if (!viewer) {
              return new Response("Not found", { status: 404 });
            }
            const userMatch = /(?:^|\/)(usr_[a-z0-9]+)(?:\/|$)/i.exec(path);
            if (userMatch) {
              const targetUserId = userMatch[1];
              if (!viewer.isAdmin && viewer.id !== targetUserId) {
                return new Response("Not found", { status: 404 });
              }
            } else if (!viewer.isAdmin) {
              return new Response("Not found", { status: 404 });
            }
          }

          const url = new URL(request.url);
          const targetWidth = Math.min(2400, Math.max(0, parseInt(url.searchParams.get("w") || "0", 10)));
          const targetQuality = Math.min(100, Math.max(40, parseInt(url.searchParams.get("q") || "85", 10)));
          
          let file: any = targetWidth > 0 ? await readBinary(`files/${path}`) : await readBinaryStream(`files/${path}`);
          if (!file) return new Response("Not found", { status: 404 });

          const etag = file.etag || `"${path}-${file.size || 0}"`;
          const cacheControl = isPrivateFolder
            ? "private, no-store"
            : "public, max-age=31536000, immutable";

          const headers: Record<string, string> = {
            "content-type": file.mime,
            etag,
            "cache-control": cacheControl,
            "x-content-type-options": "nosniff",
          };

          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers });
          }

          if (file.stream) {
            return new Response(file.stream as unknown as BodyInit, { headers });
          }
          if (file.bytes) {
            return new Response(file.bytes as unknown as BodyInit, { headers });
          }

          return new Response("Not found", { status: 404 });
        }),
    },
  },
});
