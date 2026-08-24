/**
 * 3D Texture Source — the full printable case wrap.
 *
 * ## What this field is
 *
 * `coverHiResImage` holds **one image containing Back Cover + Spine + Front
 * Cover**, exactly as a printable case insert is laid out:
 *
 *     [ BACK ] [ SPINE ] [ FRONT ]
 *
 * `GameCase3D` samples that single image across the three faces of the sleeve
 * (see src/hub/gamehub/GameCase3D.tsx), so the wrap is stored whole and
 * **never cropped**. A front cover on its own, a square card, key art, a
 * screenshot, or a photo of a retail box are all the wrong thing here — the
 * front cover has its own field (`cartridgeImage`).
 *
 * ## Why the downloader lives here
 *
 * A wrap is nearly always linked from a scan archive such as The Cover Project,
 * and those hosts answer a bare server-side request with a 403 or an HTML error
 * page rather than the file. Storing the link and hoping is what produced empty
 * texture boxes: nothing ever copied the bytes into our own storage, so the
 * product stayed permanently dependent on a host that will not serve us.
 *
 * The import therefore downloads the wrap once, through the existing hardened
 * `/api/upload` endpoint, and keeps the resulting storage URL in this same
 * field. Nothing else about the field changes.
 */

/** The product column behind the "3D Texture Source" box. Never renamed. */
export const COVER_TEXTURE_FIELD = "coverHiResImage";

/** Shown in the field when the source host refuses to hand over the file. */
export const COVER_TEXTURE_FETCH_FAILED = "تعذر تنزيل صورة 3D Texture Source من المصدر";

/** Helper text under the field: says what the image has to contain. */
export const COVER_TEXTURE_HELPER =
  "الغلاف الكامل عالي الدقة للمجسم ثلاثي الأبعاد: Back Cover + Spine + Front Cover في صورة واحدة.";

/** The storage folder wraps are written to — the same one covers already use. */
export const COVER_TEXTURE_FOLDER = "cartridges";

/**
 * Is this value still pointing at somebody else's server?
 *
 * Values already in our storage (`/api/files/...`), inline data URLs and empty
 * cells are left exactly as they are; only an absolute `http(s)` URL to another
 * host has to be copied in.
 */
export function needsStorageMirror(value: unknown): boolean {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    if (typeof window !== "undefined" && url.host === window.location.host) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Headers that make a scan archive treat the download as an ordinary image
 * request from a browser. Applied **only** to this field's download; the
 * project's general `fetch` is untouched.
 *
 * `Referer` is sent to The Cover Project alone, because that is the host whose
 * hotlink rule needs it — sending a referer to every host would leak where a
 * request came from for no benefit.
 */
export function coverTextureFetchHeaders(sourceUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host === "thecoverproject.net" || host.endsWith(".thecoverproject.net")) {
      headers["Referer"] = "https://www.thecoverproject.net/";
    }
  } catch {
    /* An unparseable URL never reaches the network — the fetcher rejects it. */
  }
  return headers;
}

export type CoverTextureMirror = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Copy an imported wrap into our storage and hand back the stored URL.
 *
 * Goes through `/api/upload`, the endpoint the "استبدال الصورة من التخزين"
 * button already uses, so the bytes land in the same bucket, under the same
 * key layout, behind the same `/api/files/...` URL. A source that answers with
 * 403, 404, HTML or anything that is not a real image is reported, never
 * stored.
 */
export async function mirrorCoverTextureSource(sourceUrl: string): Promise<CoverTextureMirror> {
  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl, folder: COVER_TEXTURE_FOLDER }),
    });
    const data = (await response.json().catch(() => null)) as {
      url?: string;
      error?: string;
    } | null;
    if (!response.ok || !data?.url) {
      return { ok: false, reason: data?.error || `HTTP ${response.status}` };
    }
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network_error" };
  }
}
