import { createFileRoute } from "@tanstack/react-router";

import { randomId } from "@/lib/crypto.server";
import { coverTextureFetchHeaders } from "@/lib/coverTexture";
import { body, guard, json } from "@/lib/http.server";
import { fetchRemoteImage, readLimitedBody } from "@/lib/security.server";
import { requireAdmin, requireUser } from "@/lib/session.server";
import { writeBinary } from "@/lib/storage.server";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const MAX_BYTES = 4 * 1024 * 1024;
/** Video is allowed to be larger, but only over multipart — a base64 data URL
 *  of this size would not survive the JSON body limit. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function isVideo(mime: string): boolean {
  return mime.startsWith("video/");
}

/**
 * An error page is a few kilobytes of HTML; a printable case wrap is not.
 * Anything below this is a refusal wearing an image content type.
 */
const MIN_REMOTE_IMAGE_BYTES = 1024;

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
  // MP4 and QuickTime both carry an ISO base-media `ftyp` box at offset 4.
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  }
  // WebM/Matroska EBML header.
  if (mime === "video/webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  return false;
}

/** The declared type is advisory; the bytes decide. */
function sniffImageMime(bytes: Uint8Array): string | undefined {
  for (const candidate of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    if (matchesMagic(bytes, candidate)) return candidate;
  }
  return undefined;
}

type RemoteImage = { ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string };

/**
 * Download an image the admin linked to, so the product stops depending on
 * somebody else's server.
 *
 * Scan archives answer a bare request with 403 or an HTML notice, so the
 * request carries ordinary browser headers (see `coverTextureFetchHeaders`).
 * The transport itself is the project's existing `fetchRemoteImage`: HTTPS
 * only, no credentials in the URL, no private or loopback address, and every
 * redirect hop re-validated — none of which this relaxes.
 */
async function downloadRemoteImage(sourceUrl: string): Promise<RemoteImage> {
  let response: Response | undefined;
  try {
    response = await fetchRemoteImage(sourceUrl, { headers: coverTextureFetchHeaders(sourceUrl) });
  } catch {
    return { ok: false, error: "remote_fetch_failed" };
  }
  // Undefined means the URL, or a host it redirected to, is one we refuse to
  // request at all.
  if (!response) return { ok: false, error: "remote_url_rejected" };
  if (!response.ok) return { ok: false, error: `remote_status_${response.status}` };

  const declared = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
  if (declared && !declared.startsWith("image/")) {
    return { ok: false, error: `remote_not_an_image_${declared}` };
  }

  const bytes = await readLimitedBody(response, MAX_BYTES);
  if (!bytes) return { ok: false, error: "remote_image_too_large" };
  if (bytes.length < MIN_REMOTE_IMAGE_BYTES) return { ok: false, error: "remote_image_too_small" };

  // A challenge or error page can arrive under any content type; the magic
  // bytes are what decide whether this is a readable image.
  const mime = sniffImageMime(bytes);
  if (!mime) return { ok: false, error: "remote_not_an_image" };

  return { ok: true, bytes, mime };
}

/**
 * Accepts multipart/form-data, a base64 data URL, or (admins only) a remote
 * image URL to download, and stores it securely in BANANTO_PRIVATE_BUCKET.
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

            mime = file.type || "image/jpeg";
            const limit = isVideo(mime) ? MAX_VIDEO_BYTES : MAX_BYTES;
            if (file.size > limit) {
              return json(
                {
                  error: isVideo(mime)
                    ? "الفيديو كبير جداً (الحد ٢٥ ميغابايت)"
                    : "الملف كبير جداً (الحد ٤ ميغابايت)",
                },
                { status: 413 },
              );
            }
            const buffer = await file.arrayBuffer();
            bytes = new Uint8Array(buffer);
          } else {
            const { dataUrl, sourceUrl, folder } = await body<{
              dataUrl?: string;
              sourceUrl?: string;
              folder?: string;
            }>(request);
            if (folder) targetFolder = folder;

            if (typeof sourceUrl === "string" && sourceUrl.trim()) {
              /*
                Fetching a URL of the caller's choosing is a sharper tool than
                accepting bytes they already hold, so this branch — and only
                this branch — is admins only. Everything after it is the
                existing pipeline: same signature check, same folder rules,
                same bucket, same `/api/files/...` URL.
              */
              await requireAdmin(request);
              const downloaded = await downloadRemoteImage(sourceUrl.trim());
              if (!downloaded.ok) {
                return json({ error: downloaded.error }, { status: 422 });
              }
              bytes = downloaded.bytes;
              mime = downloaded.mime;
            } else {
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
          }

          const ext = MIME_EXT[mime];
          if (!ext) return json({ error: "unsupported_media_type" }, { status: 415 });

          const rawFolder = targetFolder.replace(/[^a-z0-9/_-]/gi, "");
          const rootMatch =
            /^(uploads|products|cartridges|covers|banners|hardware|amiibo|accessories|bundles|used|giftcards|wallets|chat|avatars|orders|support|receipts|documents|reviews)/i.exec(
              rawFolder,
            );
          if (!rootMatch) {
            return json({ error: "invalid_upload_folder" }, { status: 400 });
          }

          // Files are namespaced by category/folder and user ID
          const root = rootMatch[1]!.toLowerCase();
          const safeFolder = `${root}/${user.id}`;
          const key = `files/${safeFolder}/${randomId("f")}.${ext}`;

          // The declared type must match the actual bytes, so a script cannot
          // arrive wearing an image or video content type.
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
