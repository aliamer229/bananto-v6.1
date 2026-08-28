/**
 * Decides whether a URL is an image by asking the server and reading the bytes.
 *
 * Three things this does not do, each because it was tried and was wrong:
 *
 *  - It does not trust the extension. `.../display/index.html?code=A7HLA` and
 *    `.../front.png` live on the same host and only one is an image.
 *  - It does not trust `Content-Type`. A server can answer `image/jpeg` and
 *    send an error page, and several answer `application/octet-stream` for a
 *    perfectly good JPEG.
 *  - It does not treat "not our host" as "fine". The Square Card and 3D Texture
 *    fields held viewer pages for months while every check that looked at them
 *    saw an https URL on an image CDN and moved on.
 *
 * The magic numbers decide. Everything else is reported alongside.
 */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** What the first bytes say the file is, whatever the headers claimed. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buf.subarray(4, 8).toString("latin1") === "ftyp" &&
    /avif|avis|heic|heix|mif1|msf1/.test(buf.subarray(8, 16).toString("latin1"))
  ) {
    return "image/avif";
  }
  if (buf.subarray(0, 2).toString("latin1") === "BM") return "image/bmp";
  const head = buf.subarray(0, 400).toString("utf8");
  if (/<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

/** True when the body is a web page rather than a file. */
export function looksLikeHtml(buf) {
  const head = buf.subarray(0, 400).toString("utf8").trimStart();
  return /^<(!doctype\s+html|html|head|body|meta|script)\b/i.test(head);
}

/**
 * A viewer URL is not an asset URL.
 *
 * Switch Images Julio publishes `…/display/index.html?code=A7HLA`, which is a
 * page that displays the image, and `…/file/switch-images-julio/A7HLA/front.png`,
 * which is the image. The application already carries this rule in
 * `db.server.ts`; the importer needs it too, or it stores the page.
 *
 * @returns the asset URL, or the input unchanged when no rule applies.
 */
export function resolveViewerUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return trimmed;

  const julio = /switch-images-julio\.com\/[^\s"']*?\bcode=([A-Za-z0-9]+)/i.exec(trimmed);
  if (julio) {
    return `https://cdn.switch-images-julio.com/file/switch-images-julio/${julio[1]}/front.png`;
  }
  return trimmed;
}

/** True when a URL is a page we know displays an image rather than being one. */
export function isViewerUrl(url) {
  return /\/display\/index(\.html)?(\?|$)|\/display\/index\b/i.test(String(url ?? ""));
}

/**
 * Fetches a URL and reports what it really is.
 *
 * @returns {Promise<{ok: boolean, kind: string, detail?: string, contentType?: string,
 *   sniffed?: string, bytes?: number, buffer?: Buffer, status?: number, url: string}>}
 *   `ok` is true only when the bytes are an image. `buffer` is present then.
 */
export async function fetchImage(url, { timeoutMs = 25_000, maxBytes = 25 * 1024 * 1024 } = {}) {
  const target = String(url ?? "").trim();
  if (!target) return { ok: false, kind: "empty", url: target };
  if (target.startsWith("data:")) return { ok: false, kind: "embedded", url: target };
  if (!/^https?:\/\//i.test(target)) return { ok: false, kind: "not-absolute", url: target };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      headers: { "user-agent": UA, accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: ctl.signal,
    });
    const contentType = String(res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok) {
      return { ok: false, kind: "http-error", status: res.status, contentType, url: target };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return { ok: false, kind: "empty-body", status: res.status, contentType, url: target };
    if (buffer.length > maxBytes) {
      return { ok: false, kind: "too-large", bytes: buffer.length, contentType, url: target };
    }
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      return {
        ok: false,
        kind: looksLikeHtml(buffer) ? "html" : "not-an-image",
        status: res.status,
        contentType,
        bytes: buffer.length,
        detail: buffer.subarray(0, 120).toString("utf8").replace(/\s+/g, " ").trim(),
        url: target,
      };
    }
    return { ok: true, kind: "image", status: res.status, contentType, sniffed, bytes: buffer.length, buffer, url: target };
  } catch (err) {
    return { ok: false, kind: "unreachable", detail: String(err?.message ?? err).slice(0, 90), url: target };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves a viewer URL if needed, then verifies it.
 *
 * Reports which URL actually answered, so a repair can store the asset URL
 * rather than the one it started from.
 */
export async function fetchImageResolving(url, options) {
  const direct = resolveViewerUrl(url);
  const first = await fetchImage(direct, options);
  if (first.ok || direct === String(url ?? "").trim()) {
    return { ...first, requested: String(url ?? "").trim(), resolved: direct };
  }
  const fallback = await fetchImage(url, options);
  return { ...fallback, requested: String(url ?? "").trim(), resolved: fallback.ok ? String(url).trim() : direct };
}
