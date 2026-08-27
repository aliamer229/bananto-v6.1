/**
 * Server-side removal of the empty field around a packshot.
 *
 * ## Why this is not a CSS problem
 *
 * The Front Box Cover arrives from supplier feeds as a box floating in a large
 * white rectangle. Framing that with `object-fit: contain` gives exactly what
 * the screenshots show: a small box adrift in white, in a card that was sized
 * for a box. The margin is *in the file*, so the file is where it has to go —
 * a CSS crop only hides it in the one component that remembers to apply the
 * crop, leaves the bytes on the wire, and shows the untrimmed image for the
 * first paint every time.
 *
 * Trimming here instead means:
 *
 * - the image is correct in every surface, including ones written later;
 * - it is correct in the very first painted frame, with no measure-then-shift;
 * - the trimmed pixels are never downloaded;
 * - and, because `/api/img` is the read path for *existing* catalogue images,
 *   products already in production D1 are repaired on their next request. No
 *   migration, no rewriting of image URLs, nothing to run by hand.
 *
 * ## One definition of "padding"
 *
 * The decision itself is {@link computeTrimBox} — the same pure function the
 * browser already uses, with its confidence gate, its over-crop guards and its
 * refusal to touch an image whose border is dark or saturated. This module only
 * feeds it pixels and turns its answer into a rectangle sharp can extract.
 *
 * It replaces a separate heuristic that sampled the four corner *pixels* and
 * handed off to sharp's own `.trim()`. One pixel per corner is a coin flip on a
 * JPEG: ringing, a drop shadow, or a logo that reaches a corner all defeat it,
 * and sharp's trim has none of the guards above, so when it did fire there was
 * nothing to stop it eating a rating badge.
 */
import { ANALYSIS_MAX_SIDE, computeTrimBox, type TrimResult } from "./imageTrim";

/** A rectangle in source pixels, in the shape `sharp.extract()` wants. */
export interface PixelCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DetectedTrim {
  crop: PixelCrop;
  /** The underlying decision, for logging and diagnostics. */
  detail: TrimResult;
  /** Oriented source dimensions the crop is expressed against. */
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * EXIF orientations 5-8 are the quarter turns, which swap width and height.
 *
 * Everything downstream runs after `.rotate()`, so the crop has to be measured
 * against the *oriented* frame or it lands on its side.
 */
function orientedSize(
  width: number | undefined,
  height: number | undefined,
  orientation: number | undefined,
): { width: number; height: number } | null {
  if (!width || !height) return null;
  return (orientation ?? 1) >= 5 ? { width: height, height: width } : { width, height };
}

function clampCrop(crop: PixelCrop, width: number, height: number): PixelCrop | null {
  const left = Math.max(0, Math.min(width - 1, Math.round(crop.left)));
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.top)));
  const w = Math.max(1, Math.min(width - left, Math.round(crop.width)));
  const h = Math.max(1, Math.min(height - top, Math.round(crop.height)));
  // A crop that is the whole frame is a no-op; say so rather than paying for an
  // extract that changes nothing.
  if (left === 0 && top === 0 && w === width && h === height) return null;
  return { left, top, width: w, height: h };
}

/**
 * Finds the artwork inside `bytes`, or `null` to leave the image alone.
 *
 * `null` is the answer for every uncertain case — see {@link computeTrimBox}.
 * Callers show the untouched image, which is always a valid picture; a wrong
 * crop is not.
 *
 * @param sharpFn the `sharp` factory, passed in by the caller that already
 *   imported it, so this module stays free of a hard dependency on a native
 *   module that is not present in every runtime.
 */
export async function detectTrimCrop(
  bytes: Uint8Array,
  sharpFn: (input: Uint8Array, options?: unknown) => any,
): Promise<DetectedTrim | null> {
  try {
    const meta = await sharpFn(bytes, { failOnError: false }).metadata();
    const size = orientedSize(meta?.width, meta?.height, meta?.orientation);
    if (!size) return null;

    // A 4K packshot decides nothing a 320px one will not, and the analysis is
    // O(pixels) with a per-row scan on top.
    const { data, info } = await sharpFn(bytes, { failOnError: false })
      .rotate()
      .resize({
        width: ANALYSIS_MAX_SIDE,
        height: ANALYSIS_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info?.channels !== 4) return null;

    const detail = computeTrimBox(new Uint8Array(data), info.width, info.height);
    if (!detail) return null;

    const crop = clampCrop(
      {
        left: detail.left * size.width,
        top: detail.top * size.height,
        width: detail.width * size.width,
        height: detail.height * size.height,
      },
      size.width,
      size.height,
    );
    if (!crop) return null;

    return { crop, detail, sourceWidth: size.width, sourceHeight: size.height };
  } catch {
    // Anything sharp cannot decode is simply not trimmed.
    return null;
  }
}
