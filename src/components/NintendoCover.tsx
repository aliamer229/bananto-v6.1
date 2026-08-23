/**
 * The single way a Nintendo cover reaches the screen.
 *
 * Two jobs, both of which used to be improvised per component:
 *
 * 1. **Ask {@link resolveNintendoImage} which picture to show** — so the same
 *    product cannot show a box cover in a listing, a screenshot in the cart and
 *    a banner in the toast.
 * 2. **Frame the artwork, not the file** — if the source has empty margin
 *    around the box (reference 01), the crop rectangle from `imageTrim` is
 *    applied so the box fills the frame (reference 02). If it does not, or if
 *    detection was not confident, the file is shown untouched.
 *
 * The frame is a fixed ratio per usage, so a row of covers is a row of equal
 * rectangles regardless of what the sources were. Inside it, the artwork is
 * fitted whole (`contain` semantics) — never stretched, never letterboxed by
 * margin that should have been trimmed away, never cropped through a logo.
 *
 * ## Cost
 *
 * Nothing is measured during render. A stored `cartridgeImageTrim` is used as
 * is; otherwise a cached answer is read synchronously, and only a genuinely
 * unseen URL schedules one idle-time measurement whose result is cached for
 * every later card and every later visit. See `imageTrim.browser.ts`.
 */
import { useCallback, useEffect, useState } from "react";

import { useImageTrim } from "@/hooks/useImageTrim";
import { cdnImage } from "@/lib/img";
import { trimToImageStyle } from "@/lib/imageTrim";
import {
  COVER_ASPECT_RATIO,
  NINTENDO_IMAGE_PLACEHOLDER,
  resolveNintendoImage,
  SQUARE_CARD_ASPECT_RATIO,
  type NintendoImageUsage,
} from "@/lib/nintendoImages";

export interface NintendoCoverProps {
  product: Record<string, unknown> | null | undefined;
  usage?: NintendoImageUsage;
  /**
   * Frame ratio (width / height). Defaults to the retail cover ratio, or 1 for
   * `square-card`. Pass `null` to let the frame be sized entirely by its parent.
   */
  ratio?: number | null;
  /**
   * `contain` fits the whole artwork inside the frame (the default, and correct
   * for a cover). `cover` fills the frame and lets the artwork's long edge
   * overflow — only for windows that are a different shape by design, such as
   * the cartridge label.
   */
  fit?: "contain" | "cover";
  alt?: string;
  className?: string;
  /** Applied to the `<img>` itself; use for hover transforms. */
  imgClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  onClick?: (() => void) | undefined;
}

/**
 * Resolves the artwork plus its crop box, measuring the file only when nothing
 * already knows the answer.
 */
export function useNintendoCover(
  product: Record<string, unknown> | null | undefined,
  usage: NintendoImageUsage,
) {
  const resolved = resolveNintendoImage(product, usage);
  const proxied = cdnImage(resolved.url);
  const { trim, naturalAspect } = useImageTrim(proxied, resolved.trim, !resolved.isPlaceholder);
  return { resolved, src: proxied, trim, naturalAspect };
}

export function NintendoCover({
  product,
  usage = "front-cover",
  ratio,
  fit = "contain",
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority,
  onClick,
}: NintendoCoverProps) {
  const { resolved, src, trim, naturalAspect } = useNintendoCover(product, usage);
  const [failed, setFailed] = useState(false);
  // The element's own load event gives the natural size for free, without the
  // decode + getImageData the trim pass needs, so the frame settles on the
  // first paint rather than on the first idle callback.
  const [loadedAspect, setLoadedAspect] = useState<number | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoadedAspect(null);
  }, [src]);

  const onLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setLoadedAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  const frameRatio =
    ratio === null
      ? null
      : (ratio ?? (usage === "square-card" ? SQUARE_CARD_ASPECT_RATIO : COVER_ASPECT_RATIO));

  const showPlaceholder = resolved.isPlaceholder || failed;
  const finalSrc = showPlaceholder ? NINTENDO_IMAGE_PLACEHOLDER : src;

  /*
    Two nested boxes do the framing exactly, with no JavaScript at paint time.

    - the outer box is the fixed-ratio slot in the layout.
    - the inner "window" is the artwork's own rectangle after trimming. It is
      sized by aspect ratio and capped by the frame, so `contain` fits it whole
      and `cover` fills the frame. The image inside is scaled and offset by
      `trimToImageStyle`, which lands the crop on the window exactly — the
      file's untouched pixels, reframed.
  */
  const sourceAspect = naturalAspect ?? loadedAspect;
  const artworkAspect =
    trim && sourceAspect ? (sourceAspect * trim.width) / trim.height : sourceAspect;

  /*
    Which edge the window pins to. `aspect-ratio` alone would leave the box with
    no definite size — the image inside is absolutely positioned and contributes
    nothing — so one dimension is always pinned to the frame and the other
    follows from the ratio.
  */
  const windowStyle: React.CSSProperties = (() => {
    if (!artworkAspect || !frameRatio || showPlaceholder) {
      return { width: "100%", height: "100%" };
    }
    const artworkIsWider = artworkAspect >= frameRatio;
    const fillWidth = fit === "cover" ? !artworkIsWider : artworkIsWider;
    return fillWidth
      ? { width: "100%", aspectRatio: String(artworkAspect) }
      : { height: "100%", aspectRatio: String(artworkAspect) };
  })();

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={frameRatio ? { aspectRatio: String(frameRatio) } : undefined}
      {...(onClick ? { onClick } : {})}
    >
      <div className="relative overflow-hidden" style={windowStyle}>
        <img
          src={finalSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          {...(fetchPriority ? { fetchPriority } : {})}
          onError={() => setFailed(true)}
          onLoad={onLoad}
          className={imgClassName}
          style={
            !showPlaceholder && trim
              ? trimToImageStyle(trim)
              : {
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  // With the window already at the artwork's aspect this is a
                  // no-op; before the size is known it is what keeps the image
                  // whole instead of stretched.
                  objectFit: showPlaceholder ? "cover" : fit,
                }
          }
        />
      </div>
    </div>
  );
}

export default NintendoCover;
