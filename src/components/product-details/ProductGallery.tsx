import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "@/i18n";

/**
 * Image viewer for the details hero.
 *
 * The arrows are laid out with logical properties and the icons swap with
 * direction, so "next" points right in English/Turkish and left in Arabic
 * rather than merely mirroring the button positions.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const { t, dir } = useTranslation();
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<number>>(new Set());

  const usable = images.filter((_, index) => !broken.has(index));
  const current = images[active];

  if (images.length === 0 || usable.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ImageOff className="h-10 w-10 opacity-30" />
      </div>
    );
  }

  const step = (delta: number) => setActive((i) => (i + delta + images.length) % images.length);
  const isRtl = dir === "rtl";
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted">
        {current ? (
          <img
            src={current}
            alt={alt}
            loading="eager"
            className="h-full w-full object-contain"
            onError={() => setBroken((prev) => new Set(prev).add(active))}
          />
        ) : null}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("common.previous")}
              className="absolute top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-sm backdrop-blur transition hover:bg-background"
              style={{ insetInlineStart: "0.5rem" }}
            >
              <PrevIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("common.next")}
              className="absolute top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-sm backdrop-blur transition hover:bg-background"
              style={{ insetInlineEnd: "0.5rem" }}
            >
              <NextIcon className="h-4 w-4" />
            </button>
            <div
              className="absolute bottom-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-bold backdrop-blur"
              style={{ insetInlineEnd: "0.5rem" }}
              dir="ltr"
            >
              {active + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, index) =>
            broken.has(index) ? null : (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`${alt} ${index + 1}`}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  index === active ? "border-primary" : "border-border opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={() => setBroken((prev) => new Set(prev).add(index))}
                />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
