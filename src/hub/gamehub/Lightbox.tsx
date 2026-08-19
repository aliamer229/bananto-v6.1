import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import type { GameImage } from "@/hub/types";
import { useI18n } from "@/hub/i18n";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";

/**
 * Fullscreen image viewer: arrow-key navigation, zoom, and a filmstrip.
 *
 * Kept separate from `Modal` because it needs edge-to-edge presentation and its
 * own keyboard map, and because both the hero and the gallery open it.
 */
export function Lightbox({
  images,
  startId,
  onClose,
}: {
  images: GameImage[];
  startId: string | null;
  onClose: () => void;
}) {
  const { t, isRtl } = useI18n();
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const open = startId !== null;

  useEffect(() => {
    if (!startId) return;
    const found = images.findIndex((image) => image.id === startId);
    setIndex(found >= 0 ? found : 0);
    setZoomed(false);
  }, [startId, images]);

  const go = useCallback(
    (delta: number) => {
      setZoomed(false);
      setIndex((current) => (current + delta + images.length) % images.length);
    },
    [images.length],
  );

  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // Arrow semantics follow reading direction.
      if (event.key === "ArrowRight") go(isRtl ? -1 : 1);
      if (event.key === "ArrowLeft") go(isRtl ? 1 : -1);
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose, go, isRtl]);

  if (typeof document === "undefined") return null;

  const image = images[index];

  return createPortal(
    <AnimatePresence>
      {open && image && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[75] flex flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("media.gallery")}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="min-w-0 text-xs muted">
              <span className="font-bold text-white">
                {index + 1} / {images.length}
              </span>
              <span className="ms-3 truncate">{image.alt}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomed((v) => !v)}
                aria-label={zoomed ? "Zoom out" : "Zoom in"}
                className="rounded-lg p-2 muted transition-colors hover:bg-white/10 hover:text-white"
              >
                {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
              </button>
              <button
                onClick={onClose}
                aria-label={t("common.close")}
                className="rounded-lg p-2 muted transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={image.id}
                src={cdnImage(image.url)}
                alt={image.alt}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setZoomed((v) => !v)}
                className={cn(
                  "max-h-full max-w-full select-none",
                  zoomed
                    ? "h-auto w-auto max-w-none cursor-zoom-out object-none"
                    : "cursor-zoom-in object-contain",
                )}
              />
            </AnimatePresence>

            {images.length > 1 && (
              <>
                <NavButton
                  side="start"
                  onClick={() => go(isRtl ? 1 : -1)}
                  label={t("media.previous")}
                />
                <NavButton side="end" onClick={() => go(isRtl ? -1 : 1)} label={t("media.next")} />
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
              {images.map((thumb, thumbIndex) => (
                <button
                  key={thumb.id}
                  onClick={() => {
                    setIndex(thumbIndex);
                    setZoomed(false);
                  }}
                  aria-label={thumb.alt}
                  className={cn(
                    "h-12 w-20 shrink-0 overflow-hidden rounded-md transition-all",
                    thumbIndex === index ? "ring-2 ring-nin" : "opacity-45 hover:opacity-80",
                  )}
                >
                  <img
                    src={cdnImage(thumb.thumbUrl ?? thumb.url)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function NavButton({
  side,
  onClick,
  label,
}: {
  side: "start" | "end";
  onClick: () => void;
  label: string;
}) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-nin",
        side === "start" ? "left-3" : "right-3",
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
