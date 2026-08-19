import { createFileRoute } from "@tanstack/react-router";

import { randomId } from "@/lib/crypto.server";
import { body, guard, json } from "@/lib/http.server";
import { requireUser } from "@/lib/session.server";
import { writeBinary } from "@/lib/storage.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 4 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function matchesMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/gif") {
    return new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/) !== null;
  }
  if (mime === "image/webp") {
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

/**
 * Accepts multipart/form-data or a base64 data URL and stores it securely in BANANTO_PRIVATE_BUCKET.
 * Returned URL is served through authenticated /api/files/$.
 */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const user = await requireUser(request);
          const throttle = await consumeRateLimit(request, "upload", 30, 60 * 60, user.id);
          if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

          const contentType = request.headers.get("content-type") || "";

          let bytes: Uint8Array;
          let mime: string;
          let targetFolder = "uploads";

          if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");
            const formFolder = formData.get("folder");
            if (typeof formFolder === "string") targetFolder = formFolder;

            if (!file || !(file instanceof File)) {
              return json({ error: "missing_file" }, { status: 400 });
            }

            if (file.size > MAX_BYTES) {
              return json({ error: "الملف كبير جداً (الحد ٤ ميغابايت)" }, { status: 413 });
            }

            mime = file.type || "image/jpeg";
            const buffer = await file.arrayBuffer();
            bytes = new Uint8Array(buffer);
          } else {
            const { dataUrl, folder } = await body<{ dataUrl?: string; folder?: string }>(request);
            if (folder) targetFolder = folder;
            const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl ?? "");
            if (!match) return json({ error: "invalid_data_url" }, { status: 400 });

            mime = match[1]!;
            const base64 = match[2]!;
            if (base64.length * 0.75 > MAX_BYTES) {
              return json({ error: "الملف كبير جداً (الحد ٤ ميغابايت)" }, { status: 413 });
            }

            try {
              bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            } catch {
              return json({ error: "invalid_base64" }, { status: 400 });
            }
          }

          const ext = MIME_EXT[mime];
          if (!ext) return json({ error: "unsupported_image_type" }, { status: 415 });

          const rawFolder = targetFolder.replace(/[^a-z0-9/_-]/gi, "");
          const rootMatch =
            /^(uploads|products|cartridges|covers|banners|hardware|amiibo|accessories|bundles|used|giftcards|wallets|chat|avatars|orders|support|receipts|documents)/i.exec(
              rawFolder,
            );
          if (!rootMatch) {
            return json({ error: "invalid_upload_folder" }, { status: 400 });
          }

          // Files are namespaced by category/folder and user ID
          const root = rootMatch[1]!.toLowerCase();
          const safeFolder = `${root}/${user.id}`;
          const key = `files/${safeFolder}/${randomId("f")}.${ext}`;

          if (!matchesMagic(bytes, mime)) {
            return json({ error: "file_signature_mismatch" }, { status: 415 });
          }

          const isPrivateFolder =
            /^(chat|uploads|wallets|orders|support|receipts|documents)\//i.test(`${root}/`);
          const cacheControl = isPrivateFolder ? "private, no-store" : "public, max-age=31536000";

          // Write to storage bucket
          await writeBinary(key, bytes, mime, { cacheControl });

          return json({ url: `/api/files/${key.slice("files/".length)}` });
        }),
    },
  },
});
