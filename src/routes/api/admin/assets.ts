import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import {
  ALLOWED_PUBLIC_PREFIXES,
  ALLOWED_PUBLIC_MIMES,
  uploadPublicAsset,
  listPublicAssets,
  deletePublicAsset,
} from "@/lib/public-assets.server";

const MAX_PUBLIC_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB limit

export const Route = createFileRoute("/api/admin/assets")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const url = new URL(request.url);
          const prefix = url.searchParams.get("prefix") ?? "Images/Services/";

          const objects = await listPublicAssets(prefix);
          return json({
            objects,
            allowedPrefixes: ALLOWED_PUBLIC_PREFIXES,
          });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const { dataUrl, folder, filename } = await body<{
            dataUrl?: string;
            folder?: string;
            filename?: string;
          }>(request);

          const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl ?? "");
          if (!match) return json({ error: "invalid_data_url" }, { status: 400 });

          const mime = match[1]!;
          const base64 = match[2]!;

          if (!ALLOWED_PUBLIC_MIMES[mime]) {
            return json({ error: "unsupported_media_type" }, { status: 415 });
          }

          if (base64.length * 0.75 > MAX_PUBLIC_UPLOAD_BYTES) {
            return json({ error: "file_too_large" }, { status: 413 });
          }

          const targetFolder = folder ?? "Images/Pages/";

          let bytes: Uint8Array;
          try {
            bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          } catch {
            return json({ error: "invalid_base64" }, { status: 400 });
          }

          const result = await uploadPublicAsset({
            folder: targetFolder,
            bytes,
            mime,
            customFilename: filename,
          });

          return json(result);
        }),

      DELETE: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const { key } = await body<{ key?: string }>(request);
          if (!key) return json({ error: "key_required" }, { status: 400 });

          const success = await deletePublicAsset(key);
          return json({ success });
        }),
    },
  },
});
