import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { ingestRemoteImage } from "@/lib/mediaIngest.server";

export const Route = createFileRoute("/api/admin/media/import-url")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const reqBody = await body<{
            url?: string;
            product_id?: string;
            productId?: string;
            role?: string;
            field?: string;
          }>(request);

          const rawUrl = reqBody.url?.trim();
          if (!rawUrl) {
            return json({ error: "Missing required 'url' parameter" }, { status: 400 });
          }

          const targetProductId = reqBody.product_id || reqBody.productId || "general";
          const targetField = reqBody.role || reqBody.field || "image";

          const isHighQuality =
            targetField === "wrap" ||
            targetField === "coverHiResImage" ||
            targetField === "3d-texture" ||
            targetField.includes("3d");

          const result = await ingestRemoteImage({
            sourceUrl: rawUrl,
            productId: targetProductId,
            field: targetField,
            expectedType: targetField === "wrap" ? "wrap" : targetField === "gallery" ? "gallery" : "general",
            highQuality: isHighQuality,
          });

          if (!result.ok || !result.storedUrl) {
            return json(
              {
                success: false,
                error: result.error || "Failed to download and ingest remote media",
                status: result.status,
                httpStatus: result.httpStatus,
                attempts: result.attempts,
                sourceHost: result.sourceHost,
                warning: result.warning,
              },
              { status: 422 }
            );
          }

          return json({
            success: true,
            status: result.status,
            storedUrl: result.storedUrl,
            sourceUrl: result.sourceUrl,
            mime: result.mime,
            sizeBytes: result.sizeBytes,
            width: result.width,
            height: result.height,
            sha256: result.sha256,
            productId: result.productId,
            field: result.field,
            attempts: result.attempts,
          });
        }),
    },
  },
});
