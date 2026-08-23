/**
 * Quality gate for imported artwork.
 *
 * Two levels, because they cost different things:
 *
 * - {@link validateImageUrlShape} is pure string work and runs inside the
 *   import parser on every `url` field. It catches what import feeds actually
 *   produce when something upstream went wrong: `"[object Object]"` from a
 *   stringified nested value, the literal `"undefined"`/`"null"` from template
 *   interpolation, whitespace-only spreadsheet cells, and bare filenames with
 *   no host or path.
 *
 * - {@link inspectImageAsset} fetches the file and measures it. It answers the
 *   questions a URL cannot: is it reachable, is it actually an image, is it big
 *   enough to be a cover, is it a wide banner someone pasted into the cover
 *   field, is it blank.
 *
 * Neither ever throws, and neither is fatal. A bad cover is reported as a
 * warning and that one field is dropped — importing forty games must not fail
 * because the ninth has a dead thumbnail.
 */
import { computeTrimBox, ANALYSIS_MAX_SIDE, type TrimResult } from "./imageTrim";
import { isUsableImageUrl } from "./nintendoImages";

export interface ImageIssue {
  code:
    | "empty"
    | "malformed"
    | "unreachable"
    | "not-an-image"
    | "too-small"
    | "implausible-aspect"
    | "looks-like-banner"
    | "mostly-blank";
  /** Arabic, because that is what the admin import panel shows. */
  message: string;
  severity: "error" | "warning";
}

export interface ShapeResult {
  ok: boolean;
  /** The trimmed URL when `ok`. */
  value?: string;
  issue?: ImageIssue;
}

/** Structural check. Cheap, synchronous, safe to run on every imported field. */
export function validateImageUrlShape(raw: unknown): ShapeResult {
  if (raw === null || raw === undefined) {
    return { ok: false, issue: { code: "empty", message: "قيمة فارغة", severity: "warning" } };
  }

  if (typeof raw === "object") {
    return {
      ok: false,
      issue: {
        code: "malformed",
        message: "قيمة صورة غير صالحة (كائن بدلاً من رابط)",
        severity: "warning",
      },
    };
  }

  const value = String(raw).trim();
  if (!value) {
    return { ok: false, issue: { code: "empty", message: "قيمة فارغة", severity: "warning" } };
  }

  const usable: boolean = isUsableImageUrl(value);
  if (!usable) {
    return {
      ok: false,
      issue: {
        code: "malformed",
        message: `رابط صورة غير صالح: "${value.slice(0, 60)}"`,
        severity: "warning",
      },
    };
  }

  return { ok: true, value };
}

export interface AssetExpectation {
  /** What the field is for. Decides the plausible aspect band. */
  kind: "front-cover" | "square-card" | "banner";
  /** Smallest acceptable long edge, in pixels. */
  minLongEdge?: number;
}

export interface AssetReport {
  url: string;
  ok: boolean;
  width?: number;
  height?: number;
  aspect?: number;
  /**
   * The crop this asset needs, if any. Measured in the same pass as the quality
   * checks — the file is already decoded, so it costs nothing extra — and ready
   * to store on the product as `cartridgeImageTrim`.
   */
  trim?: TrimResult | null;
  issues: ImageIssue[];
}

/**
 * Plausible aspect bands (width / height).
 *
 * A retail front cover is around 0.7. `square-card` allows a generous band
 * because eShop tiles are not all exactly square. `banner` is anything clearly
 * landscape. The bands overlap deliberately: the point is to catch a *category*
 * error — a 1280x480 banner pasted into the cover field — not to police a few
 * percent either way.
 */
const ASPECT_BANDS: Record<AssetExpectation["kind"], [number, number]> = {
  "front-cover": [0.45, 1.15],
  "square-card": [0.7, 1.45],
  banner: [1.4, 6],
};

const MIN_LONG_EDGE: Record<AssetExpectation["kind"], number> = {
  "front-cover": 240,
  "square-card": 160,
  banner: 480,
};

/**
 * Loads `url` and reports everything wrong with it as an asset of `kind`.
 *
 * Browser only — it needs a canvas to measure content. On the server, or if the
 * canvas is tainted, the measurement checks are skipped and only reachability
 * and dimensions are reported.
 */
export async function inspectImageAsset(
  url: string,
  expectation: AssetExpectation,
): Promise<AssetReport> {
  const issues: ImageIssue[] = [];
  const shape = validateImageUrlShape(url);
  if (!shape.ok) {
    return { url: String(url ?? ""), ok: false, issues: [shape.issue!] };
  }

  const src = shape.value!;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { url: src, ok: true, issues };
  }

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    try {
      if (/^https?:\/\//i.test(src) && new URL(src).origin !== window.location.origin) {
        el.crossOrigin = "anonymous";
      }
    } catch {
      el.crossOrigin = "anonymous";
    }
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });

  if (!img) {
    issues.push({
      code: "unreachable",
      message: "تعذّر تحميل الصورة من الرابط",
      severity: "warning",
    });
    return { url: src, ok: false, issues };
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) {
    issues.push({
      code: "not-an-image",
      message: "الملف ليس صورة صالحة",
      severity: "warning",
    });
    return { url: src, ok: false, issues };
  }

  const aspect = width / height;
  const longEdge = Math.max(width, height);
  const minLongEdge = expectation.minLongEdge ?? MIN_LONG_EDGE[expectation.kind];

  if (longEdge < minLongEdge) {
    issues.push({
      code: "too-small",
      message: `أبعاد الصورة صغيرة جداً (${width}×${height})، الحد الأدنى ${minLongEdge}px`,
      severity: "warning",
    });
  }

  const [minAspect, maxAspect] = ASPECT_BANDS[expectation.kind];
  if (aspect < minAspect || aspect > maxAspect) {
    // Say the more useful thing when a landscape file lands in a cover field.
    if (expectation.kind !== "banner" && aspect >= ASPECT_BANDS.banner[0]) {
      issues.push({
        code: "looks-like-banner",
        message: `الصورة عريضة (${width}×${height}) وتبدو بنر وليست غلاف علبة`,
        severity: "warning",
      });
    } else {
      issues.push({
        code: "implausible-aspect",
        message: `نسبة أبعاد غير متوقعة (${aspect.toFixed(2)}) لهذا النوع من الصور`,
        severity: "warning",
      });
    }
  }

  // Blankness: reuse the trim pass. A file whose artwork bounds cover almost
  // nothing — or that has no non-background pixels at all — is a placeholder
  // someone exported by mistake.
  let trim: TrimResult | null = null;
  try {
    const scale = Math.min(1, ANALYSIS_MAX_SIDE / longEdge);
    const w = Math.max(8, Math.round(width * scale));
    const h = Math.max(8, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      if (isMostlyBlank(data)) {
        issues.push({
          code: "mostly-blank",
          message: "الصورة فارغة تقريباً (لا تحتوي على رسم واضح)",
          severity: "warning",
        });
      } else {
        trim = computeTrimBox(data, w, h);
      }
    }
  } catch {
    // Tainted canvas on a host the proxy did not cover. Dimensions still stand.
  }

  return { url: src, ok: issues.length === 0, width, height, aspect, trim, issues };
}

/**
 * True when almost every pixel matches the frame's own colour — a blank plate,
 * a solid fill, or a near-empty export.
 */
export function isMostlyBlank(data: Uint8ClampedArray | Uint8Array, threshold = 0.985): boolean {
  if (data.length < 16) return true;
  const r0 = data[0] ?? 0;
  const g0 = data[1] ?? 0;
  const b0 = data[2] ?? 0;
  let same = 0;
  const pixels = Math.floor(data.length / 4);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    if (
      Math.abs((data[o] ?? 0) - r0) <= 12 &&
      Math.abs((data[o + 1] ?? 0) - g0) <= 12 &&
      Math.abs((data[o + 2] ?? 0) - b0) <= 12
    ) {
      same++;
    }
  }
  return same / pixels >= threshold;
}

/** Which expectation applies to each product image field. */
export const FIELD_EXPECTATIONS: Record<string, AssetExpectation["kind"]> = {
  cartridgeImage: "front-cover",
  coverImage: "front-cover",
  coverHiResImage: "front-cover",
  box_front_url: "front-cover",
  nintendoCardImage: "square-card",
  bannerImage: "banner",
  banner: "banner",
};
