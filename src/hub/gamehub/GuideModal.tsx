import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Clock, ExternalLink, RefreshCw, X } from "lucide-react";
import type { Game, Guide } from "@/hub/types";
import { GUIDE_META } from "./Extras";
import { useI18n } from "@/hub/i18n";
import { formatDate } from "@/hub/utils/format";
import { gamePath } from "@/hub/utils/seo";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";

/**
 * Guide reader.
 *
 * Evolves the original `showGuideModal`: a sheet that fills the screen on
 * mobile and becomes a centred reader on desktop, with a sticky header and a
 * progress bar driven by the scroll position of the content itself.
 *
 * It links out to the guide's own route rather than replacing it — the modal is
 * the in-page reading experience, the route is the shareable, indexable one.
 */
export function GuideModal({
  game,
  guide,
  onClose,
}: {
  game: Game;
  guide: Guide | null;
  onClose: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const open = guide !== null;

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const max = node.scrollHeight - node.clientHeight;
    setProgress(max > 0 ? Math.min(1, node.scrollTop / max) : 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    setProgress(0);
    setRevealed(false);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const heroImage = guide?.heroImageId
    ? game.images?.find((image) => image.id === guide.heroImageId)
    : undefined;
  const spoilerGated = guide?.spoilerLevel === "heavy" && !revealed;
  const Icon = guide ? GUIDE_META[guide.category].icon : Clock;

  return createPortal(
    <AnimatePresence>
      {open && guide && (
        <div className="fixed inset-0 z-[72] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={guide.title}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="relative z-10 flex h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-850 sm:h-[85vh] sm:max-w-2xl sm:rounded-3xl"
          >
            {/* Sticky header + reading progress */}
            <div className="relative shrink-0 border-b border-white/[0.07] bg-ink-850/95 backdrop-blur">
              <div className="flex items-start gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
                  <Icon className="h-4 w-4 text-nin-soft" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider muted">
                    {t(GUIDE_META[guide.category].key as never)}
                  </p>
                  <h2 className="mt-0.5 text-base font-extrabold leading-snug">{guide.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[10px] muted">
                    {guide.readingTime != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("guides.readingTime", { minutes: guide.readingTime })}
                      </span>
                    )}
                    {guide.updatedAt && (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {formatDate(guide.updatedAt, intlLocale)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t("common.close")}
                  className="-me-1 -mt-1 shrink-0 rounded-xl p-2 muted transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                className="absolute inset-x-0 bottom-0 h-[2px] origin-[left] bg-nin transition-[width] duration-150"
                style={{ width: `${progress * 100}%` }}
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
            >
              {heroImage && (
                <img
                  src={cdnImage(heroImage.url)}
                  alt={heroImage.alt}
                  loading="lazy"
                  className="mb-5 aspect-[16/9] w-full rounded-2xl border border-white/[0.07] object-cover"
                />
              )}

              <p className="text-sm leading-relaxed muted">{guide.summary}</p>

              {spoilerGated ? (
                <div className="mt-6 rounded-2xl bg-warn/[0.08] p-6 text-center">
                  <p className="text-sm font-bold text-warn">{t("guides.spoilerHeavy")}</p>
                  <p className="mt-1 text-xs muted">{t("story.spoiler")}</p>
                  <button
                    onClick={() => setRevealed(true)}
                    className="btn btn-quiet mt-4 h-9 px-4 text-xs"
                  >
                    {t("story.reveal")}
                  </button>
                </div>
              ) : guide.sections && guide.sections.length > 0 ? (
                <div className="mt-6 space-y-7">
                  {guide.sections.map((section, index) => (
                    <section key={index}>
                      {section.heading && (
                        <h3 className="mb-2.5 text-sm font-extrabold">{section.heading}</h3>
                      )}
                      {section.body && (
                        <p className="text-sm leading-[1.85] muted">{section.body}</p>
                      )}
                      {section.steps && section.steps.length > 0 && (
                        <ol className="mt-3 space-y-3">
                          {section.steps.map((step, stepIndex) => (
                            <li key={stepIndex} className="flex gap-3">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-extrabold">
                                {stepIndex + 1}
                              </span>
                              <span className="text-sm leading-[1.75] muted">{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-2xl bg-white/[0.03] p-5 text-center text-xs muted">
                  {t("common.notAvailable")}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
