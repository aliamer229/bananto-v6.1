/**
 * Deterministic removal of the empty margin around a retail box cover.
 *
 * Store feeds hand back two shapes of the same artwork: a tight rectangular
 * packshot, and the same packshot floating in a big white (or transparent, or
 * off-white JPEG) field. The second one is what makes a cover grid look like
 * scattered stamps — the box occupies a third of the frame and every card
 * disagrees about how much air surrounds it.
 *
 * This module finds the artwork's real bounding box so the render layer can
 * frame that box instead of the file. It is plain pixel arithmetic — no model,
 * no network, no heuristics that depend on the game. The same bytes always
 * produce the same box.
 *
 * ## What it will not do
 *
 * Cropping the wrong thing is far worse than not cropping, because it eats a
 * rating badge or a publisher logo and nobody notices for months. So every
 * uncertain case returns `null` and the caller shows the untouched image:
 *
 * - the border is not one near-uniform, light colour (`confidence` gate)
 * - the margins are already negligible (a reference-02 style tight cover)
 * - the surviving box is a small fraction of the frame (`MIN_AREA_RATIO`)
 * - the surviving box has an implausible aspect for a cover
 *
 * `null` is the safe answer, and it is the answer whenever the evidence is thin.
 */

/** Crop rectangle as fractions of the source image, `0..1` from the top-left. */
export interface TrimBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A {@link TrimBox} plus everything needed to audit or cache the decision. */
export interface TrimResult extends TrimBox {
  /** Share of border pixels that matched the detected background, `0..1`. */
  confidence: number;
  /** How the background was identified. */
  mode: "alpha" | "luminance";
  /** Analysed source dimensions, so a cached box can be re-checked. */
  sourceWidth: number;
  sourceHeight: number;
  /** Bumped when the algorithm changes, so stale cache entries are dropped. */
  version: number;
}

/** Cache entries written by an older algorithm are recomputed, not trusted. */
export const TRIM_VERSION = 1;

export interface TrimOptions {
  /**
   * Per-channel distance (0-255) at which a pixel still counts as background.
   * 18 covers JPEG ringing and the off-white paper tone scanned packshots have
   * without reaching into printed artwork.
   */
  tolerance?: number;
  /** A row/column is background when at least this share of it matches. */
  rowMatchRatio?: number;
  /** Minimum share of border pixels matching before any crop is allowed. */
  minConfidence?: number;
  /** Padding left around the artwork, as a fraction of the shorter side. */
  safeInset?: number;
}

const DEFAULTS = {
  tolerance: 18,
  rowMatchRatio: 0.985,
  minConfidence: 0.9,
  safeInset: 0.006,
} satisfies Required<TrimOptions>;

/**
 * Below this the margin is not worth a crop — it is measurement noise on an
 * already-tight cover, and re-framing it would only shift the artwork a pixel.
 */
const MIN_TRIM_FRACTION = 0.015;

/** Guards against a detection that swallowed the artwork itself. */
const MIN_AREA_RATIO = 0.25;
const MIN_SIDE_RATIO = 0.3;

/**
 * Plausible aspect band (width / height) for something we just cropped out of a
 * larger field. Retail box art sits near 0.7; the band is wide enough for square
 * eShop tiles and tall Switch 2 keep cases, and narrow enough to reject a sliver
 * or a letterboxed banner.
 */
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 1.7;

/** Analysis runs on a downsample: a 4K packshot decides nothing a 320px one won't. */
export const ANALYSIS_MAX_SIDE = 320;

type RGBA = { r: number; g: number; b: number; a: number };

function at(data: Uint8ClampedArray | Uint8Array, i: number): RGBA {
  return {
    r: data[i] ?? 0,
    g: data[i + 1] ?? 0,
    b: data[i + 2] ?? 0,
    a: data[i + 3] ?? 255,
  };
}

function isNear(px: RGBA, bg: RGBA, tolerance: number): boolean {
  // A transparent pixel is background whatever its (undefined) colour channels
  // say — PNG exporters leave arbitrary RGB under alpha 0.
  if (px.a < 16 && bg.a < 16) return true;
  if (Math.abs(px.a - bg.a) > 40) return false;
  return (
    Math.abs(px.r - bg.r) <= tolerance &&
    Math.abs(px.g - bg.g) <= tolerance &&
    Math.abs(px.b - bg.b) <= tolerance
  );
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Every pixel on the 1px frame of the image, which is what we call background. */
function borderPixels(data: Uint8ClampedArray | Uint8Array, w: number, h: number): RGBA[] {
  const out: RGBA[] = [];
  for (let x = 0; x < w; x++) {
    out.push(at(data, (0 * w + x) * 4));
    out.push(at(data, ((h - 1) * w + x) * 4));
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(at(data, (y * w + 0) * 4));
    out.push(at(data, (y * w + (w - 1)) * 4));
  }
  return out;
}

function luminance(px: RGBA): number {
  return (0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b) / 255;
}

/**
 * Finds the artwork's bounding box inside RGBA pixel data.
 *
 * Returns `null` whenever the image should be shown untouched — see the module
 * comment for the full list of refusals. `data` is row-major RGBA, exactly what
 * `CanvasRenderingContext2D.getImageData()` produces.
 */
export function computeTrimBox(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: TrimOptions = {},
): TrimResult | null {
  const opts = { ...DEFAULTS, ...options };
  if (width < 8 || height < 8) return null;
  if (data.length < width * height * 4) return null;

  const border = borderPixels(data, width, height);
  if (!border.length) return null;

  // Transparency wins when it is present: alpha bounds are exact, and an image
  // with a cut-out background has no meaningful colour to compare against.
  const transparentBorder = border.filter((p) => p.a < 16).length / border.length;
  const mode: TrimResult["mode"] = transparentBorder > 0.6 ? "alpha" : "luminance";

  const bg: RGBA =
    mode === "alpha"
      ? { r: 0, g: 0, b: 0, a: 0 }
      : {
          r: median(border.map((p) => p.r)),
          g: median(border.map((p) => p.g)),
          b: median(border.map((p) => p.b)),
          a: 255,
        };

  // A dark or saturated border is artwork bleeding to the edge, not padding.
  // Cropping against it would cut into the picture.
  if (mode === "luminance") {
    if (luminance(bg) < 0.86) return null;
    const spread = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
    if (spread > 12) return null;
  }

  const confidence = border.filter((p) => isNear(p, bg, opts.tolerance)).length / border.length;
  if (confidence < opts.minConfidence) return null;

  const rowIsBackground = (y: number): boolean => {
    let hits = 0;
    for (let x = 0; x < width; x++) {
      if (isNear(at(data, (y * width + x) * 4), bg, opts.tolerance)) hits++;
    }
    return hits / width >= opts.rowMatchRatio;
  };
  const colIsBackground = (x: number): boolean => {
    let hits = 0;
    for (let y = 0; y < height; y++) {
      if (isNear(at(data, (y * width + x) * 4), bg, opts.tolerance)) hits++;
    }
    return hits / height >= opts.rowMatchRatio;
  };

  let top = 0;
  while (top < height && rowIsBackground(top)) top++;
  if (top >= height) return null; // the whole image is background

  let bottom = height - 1;
  while (bottom > top && rowIsBackground(bottom)) bottom--;

  let left = 0;
  while (left < width && colIsBackground(left)) left++;
  if (left >= width) return null;

  let right = width - 1;
  while (right > left && colIsBackground(right)) right--;

  // Give the artwork a hair of air back, so anti-aliased edges and thin outer
  // keylines are not shaved off by an exact bound.
  const inset = Math.round(Math.min(width, height) * opts.safeInset);
  top = Math.max(0, top - inset);
  left = Math.max(0, left - inset);
  bottom = Math.min(height - 1, bottom + inset);
  right = Math.min(width - 1, right + inset);

  const boxW = right - left + 1;
  const boxH = bottom - top + 1;

  const trimmedFraction = 1 - (boxW * boxH) / (width * height);
  if (trimmedFraction < MIN_TRIM_FRACTION) return null; // already tight

  // Over-crop guards. Anything that ate most of the frame is a misdetection.
  if ((boxW * boxH) / (width * height) < MIN_AREA_RATIO) return null;
  if (boxW / width < MIN_SIDE_RATIO || boxH / height < MIN_SIDE_RATIO) return null;

  const aspect = boxW / boxH;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;

  return {
    left: left / width,
    top: top / height,
    width: boxW / width,
    height: boxH / height,
    confidence,
    mode,
    sourceWidth: width,
    sourceHeight: height,
    version: TRIM_VERSION,
  };
}

/** True when the value is a usable, current-version crop rectangle. */
export function isValidTrim(value: unknown): value is TrimBox {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<TrimResult>;
  const nums = [t.left, t.top, t.width, t.height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (t.version !== undefined && t.version !== TRIM_VERSION) return false;
  const { left = 0, top = 0, width = 0, height = 0 } = t;
  if (width <= 0 || height <= 0) return false;
  if (left < 0 || top < 0) return false;
  if (left + width > 1.0001 || top + height > 1.0001) return false;
  // A "crop" covering the whole frame is a no-op; treat it as absent.
  return width < 0.999 || height < 0.999;
}

/**
 * CSS that frames {@link TrimBox} exactly.
 *
 * The image keeps its own pixels and proportions: it is scaled by `1/width`
 * inside a window sized to the crop, then shifted so the crop's top-left lands
 * on the window's. No stretching, no `background-size` guesswork.
 *
 * Apply the returned styles to an absolutely-positioned `<img>` whose offset
 * parent is the crop window.
 */
export function trimToImageStyle(trim: TrimBox | null | undefined): React.CSSProperties {
  if (!trim || !isValidTrim(trim)) {
    return { position: "absolute", inset: 0, width: "100%", height: "100%" };
  }
  return {
    position: "absolute",
    width: `${(1 / trim.width) * 100}%`,
    height: `${(1 / trim.height) * 100}%`,
    left: `${(-trim.left / trim.width) * 100}%`,
    top: `${(-trim.top / trim.height) * 100}%`,
    maxWidth: "none",
  };
}

/**
 * Aspect ratio (width / height) of the artwork once trimmed, given the source
 * file's own ratio. Used to size the crop window so `contain` framing leaves no
 * reintroduced letterbox.
 */
export function trimmedAspect(
  trim: TrimBox | null | undefined,
  sourceAspect: number | null | undefined,
): number | null {
  if (!sourceAspect || !Number.isFinite(sourceAspect) || sourceAspect <= 0) return null;
  if (!trim || !isValidTrim(trim)) return sourceAspect;
  return (sourceAspect * trim.width) / trim.height;
}
