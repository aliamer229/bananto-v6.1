/**
 * The single way a Nintendo cover reaches the screen.
 *
 * Two jobs, both of which used to be improvised per component:
 *
 * 1. **Ask {@link resolveNintendoImage} which picture to show** — so the same
 *    product cannot show a box cover in a listing, a screenshot in the cart and
 *    a banner in the toast.
 * 2. **Frame the artwork, not the file** — if the source has empty margin
 *    around the box, the crop rectangle from `imageTrim` is
 *    applied so the box fills the frame. If it does not, or if
 *    detection was not confident, the file is shown untouched.
 *
 * The frame is a fixed ratio per usage, so a row of covers is a row of equal
 * rectangles regardless of what the sources were. Inside it, the artwork is
 * fitted whole (`contain` semantics) — never stretched, never letterboxed by
 * margin that should have been trimmed away, never cropped through a logo.
 *
 * Includes AVIF (preferred), WebP (fallback), responsive srcSet, and GPU-safe rendering.
 */
import { useCallback, useEffect, useState } from "react";

import { useImageTrim } from "@/hooks/useImageTrim";
import { cdnImage, buildSrcSet } from "@/lib/img";
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
  activeRawUrlOverride?: string,
) {
  const resolved = resolveNintendoImage(product, usage);
  const rawUrl = activeRawUrlOverride || resolved.url;
  const targetWidth =
    usage === "square-card"
      ? 360
      : usage === "front-box" ||
          usage === "listing-card" ||
          usage === "bundle-card" ||
          usage === "cart" ||
          usage === "toast"
        ? 480
        : 800;
  const proxied = cdnImage(rawUrl, { width: targetWidth });
  const { trim, naturalAspect } = useImageTrim(proxied, resolved.trim, !resolved.isPlaceholder);
  return { resolved, src: proxied, rawUrl, trim, naturalAspect };
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
  const resolved = resolveNintendoImage(product, usage);
  const candidateUrls = [resolved.url, ...(resolved.fallbackUrls || [])].filter(
    (u) => Boolean(u) && u !== NINTENDO_IMAGE_PLACEHOLDER
  );

  const [candidateIndex, setCandidateIndex] = useState(0);
  const activeRawUrl = candidateUrls[candidateIndex] || resolved.url;

  const { src, rawUrl, trim, naturalAspect } = useNintendoCover(
    product,
    usage,
    activeRawUrl
  );

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadedAspect, setLoadedAspect] = useState<number | null>(null);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
    setLoaded(false);
    setLoadedAspect(null);
  }, [resolved.url, product]);

  const onLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setLoadedAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  const onError = useCallback(() => {
    if (candidateIndex < candidateUrls.length - 1) {
      setCandidateIndex((prev) => prev + 1);
      setLoaded(false);
    } else {
      setFailed(true);
    }
  }, [candidateIndex, candidateUrls.length]);

  const frameRatio =
    ratio === null
      ? null
      : (ratio ?? (usage === "square-card" ? SQUARE_CARD_ASPECT_RATIO : COVER_ASPECT_RATIO));

  const showPlaceholder = resolved.isPlaceholder || failed || candidateUrls.length === 0;
  const finalSrc = showPlaceholder ? NINTENDO_IMAGE_PLACEHOLDER : src;

  const sourceAspect = naturalAspect ?? loadedAspect;
  const artworkAspect =
    trim && sourceAspect ? (sourceAspect * trim.width) / trim.height : sourceAspect;

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

  const avifSrcSet = !showPlaceholder && rawUrl ? buildSrcSet(rawUrl, "avif", [240, 480, 800]) : "";
  const webpSrcSet = !showPlaceholder && rawUrl ? buildSrcSet(rawUrl, "webp", [240, 480, 800]) : "";
  const sizesAttr = usage === "square-card"
    ? "(max-width: 640px) 180px, 320px"
    : "(max-width: 640px) 240px, (max-width: 1024px) 480px, 800px";

  const imgStyle: React.CSSProperties =
    !showPlaceholder && trim
      ? trimToImageStyle(trim)
      : {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: showPlaceholder ? "cover" : fit,
        };

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-muted/20 ${className}`}
      style={frameRatio ? { aspectRatio: String(frameRatio) } : undefined}
      {...(onClick ? { onClick } : {})}
    >
      <div className="relative overflow-hidden" style={windowStyle}>
        {!showPlaceholder && (avifSrcSet || webpSrcSet) ? (
          <picture className="contents">
            {avifSrcSet && <source type="image/avif" srcSet={avifSrcSet} sizes={sizesAttr} />}
            {webpSrcSet && <source type="image/webp" srcSet={webpSrcSet} sizes={sizesAttr} />}
            <img
              key={`${rawUrl}-${candidateIndex}`}
              src={finalSrc}
              alt={alt}
              loading={loading}
              decoding="async"
              {...(fetchPriority ? { fetchPriority } : {})}
              onError={onError}
              onLoad={onLoad}
              className={`${imgClassName} ${loaded ? "opacity-100" : "opacity-90 transition-opacity duration-200"}`}
              style={imgStyle}
            />
          </picture>
        ) : (
          <img
            key={`${rawUrl}-${candidateIndex}`}
            src={finalSrc}
            alt={alt}
            loading={loading}
            decoding="async"
            {...(fetchPriority ? { fetchPriority } : {})}
            onError={onError}
            onLoad={onLoad}
            className={`${imgClassName} ${loaded ? "opacity-100" : "opacity-90 transition-opacity duration-200"}`}
            style={imgStyle}
          />
        )}
      </div>
    </div>
  );
}

export default NintendoCover;
