"use client";

import { useEffect, useRef, useState } from "react";
import type { ProblemImage } from "@/lib/problems/types";

/**
 * An image bound to a problem, inside a framed container.
 *
 * Lazy-loaded, with intrinsic dimensions set so nothing shifts as it arrives,
 * a shimmering skeleton until it decodes, and click/Enter to open the lightbox.
 */
export function ProblemFigure({
  image,
  onOpen,
  priority = false,
}: {
  image: ProblemImage;
  onOpen: (image: ProblemImage) => void;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image served from cache can already be complete before React attaches
  // the onLoad handler, in which case the event never fires and the image would
  // stay invisible. Check the element directly on mount.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <figure className="group/fig m-0">
      <button
        type="button"
        onClick={() => onOpen(image)}
        aria-label={`تكبير الصورة: ${image.alt}`}
        className="relative block w-full cursor-zoom-in overflow-hidden rounded-card border border-border bg-background shadow-card transition-[transform,box-shadow] duration-300 ease-out-soft hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1"
      >
        {!loaded && (
          <div
            className="bn-skeleton absolute inset-0"
            style={{ borderRadius: "inherit" }}
            aria-hidden
          />
        )}

        <picture>
          {image.avif && <source srcSet={image.avif} type="image/avif" />}
          {image.webp && <source srcSet={image.webp} type="image/webp" />}
          <img
            ref={imgRef}
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={`block h-auto w-full transition-[opacity,transform] duration-500 ease-out-soft group-hover/fig:scale-[1.02] ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </picture>

        {/* Zoom affordance — desktop hover only, never covers the image. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 rounded-pill bg-foreground/85 px-3 py-1.5 text-xs font-semibold text-primary opacity-0 transition-opacity duration-300 group-hover/fig:opacity-100 sm:inline-flex"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
          </svg>
          تكبير
        </span>
      </button>

      {image.caption && (
        <figcaption className="mt-3 px-1 text-sm text-muted-foreground">{image.caption}</figcaption>
      )}
    </figure>
  );
}
