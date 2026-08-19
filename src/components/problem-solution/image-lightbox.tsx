"use client";

import { useEffect, useRef } from "react";
import type { ProblemImage } from "@/lib/problems/types";

/**
 * Full-size image preview.
 *
 * Built on the native <dialog> element, which gives correct modal semantics for
 * free: focus is trapped inside, Escape closes, and focus returns to the
 * trigger on close — none of which is worth reimplementing by hand.
 */
export function ImageLightbox({
  image,
  onClose,
}: {
  image: ProblemImage | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (image && !dialog.open) {
      dialog.showModal();
      // Stop the page behind the dialog from scrolling.
      document.body.style.overflow = "hidden";
    } else if (!image && dialog.open) {
      dialog.close();
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [image]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      // Clicking the backdrop (i.e. the dialog element itself) closes.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label="معاينة الصورة"
      className="m-auto max-h-[92vh] w-[min(96vw,1100px)] rounded-card border border-border bg-card p-0 shadow-lift backdrop:bg-background/70 backdrop:backdrop-blur-sm"
    >
      {image && (
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <p className="text-sm font-semibold text-muted-foreground">
              {image.caption ?? image.alt}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق المعاينة"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-pill border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="overflow-auto p-4">
            <picture>
              {image.avif && <source srcSet={image.avif} type="image/avif" />}
              {image.webp && <source srcSet={image.webp} type="image/webp" />}
              <img
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                className="mx-auto h-auto w-full max-w-full rounded-2xl"
              />
            </picture>
          </div>
        </div>
      )}
    </dialog>
  );
}
