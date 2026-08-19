import { createFileRoute } from "@tanstack/react-router";
import { guard } from "@/lib/http.server";
import { getSessionUser } from "@/lib/session.server";
import { d1First, d1Ready } from "@/lib/d1.server";
import { readBinaryStream } from "@/lib/storage.server";

export const Route = createFileRoute("/api/files/legacy/$mediaId")({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        guard(async () => {
          const mediaId = (params as { mediaId?: string }).mediaId ?? "";
          if (!mediaId || mediaId.length > 128) {
            return new Response("Not found", { status: 404 });
          }

          let mediaRecord: {
            id: string;
            original_url: string;
            v4_target_storage: string;
            v4_target_key: string;
            v4_access_policy: string;
            legacy_user_id: string | null;
            claimed_by_user_id: string | null;
          } | null = null;

          if (await d1Ready()) {
            mediaRecord =
              (await d1First(
                `SELECT * FROM legacy_media WHERE id = ? OR v4_target_key = ? LIMIT 1`,
                mediaId,
                mediaId,
              )) ?? null;
          }

          // Access Policy Enforcement (Returns 404 on unauthorized to prevent file existence enumeration)
          if (mediaRecord && mediaRecord.v4_access_policy === "private") {
            const viewer = await getSessionUser(request);
            if (!viewer || (!viewer.isAdmin && mediaRecord.claimed_by_user_id !== viewer.id)) {
              return new Response("Not found", { status: 404 });
            }
          }

          const cleanKey = mediaRecord ? mediaRecord.v4_target_key : mediaId;
          const storage = mediaRecord ? mediaRecord.v4_target_storage : "BANANTO_PRIVATE_BUCKET";

          // If public media is in BANANTO_BUCKET (assets.banan.to)
          if (
            mediaRecord &&
            mediaRecord.v4_access_policy === "public" &&
            storage === "BANANTO_BUCKET"
          ) {
            return Response.redirect(`https://assets.banan.to/${cleanKey}`, 302);
          }

          // Otherwise stream from private storage (BANANTO_PRIVATE_BUCKET)
          const file = await readBinaryStream(cleanKey);

          if (!file) {
            // If original_url is available and remote, redirect or serve fallback
            if (mediaRecord?.original_url && /^https?:\/\//.test(mediaRecord.original_url)) {
              return Response.redirect(mediaRecord.original_url, 302);
            }
            return new Response("Not found", { status: 404 });
          }

          const etag = file.etag || `"${mediaId}-${file.size || 0}"`;
          const headers: Record<string, string> = {
            "content-type": file.mime || "application/octet-stream",
            etag,
            "cache-control":
              mediaRecord?.v4_access_policy === "private"
                ? "private, no-store"
                : "public, max-age=86400",
            "content-security-policy": "default-src 'none'; sandbox",
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
