import type { ReactNode } from "react";
import { cn } from "@/hub/utils/cn";

/**
 * A hub section.
 *
 * `weight` is the visual-hierarchy control. The page must not present 30
 * sections at equal volume, so each one declares its rank:
 *   - `lead`    — the two or three things a visitor came for (price, Nintendo).
 *   - `primary` — substantial content (gameplay, editions, guides).
 *   - `support` — reference material (storage, languages, patch notes).
 * Weight drives heading size and vertical rhythm only; it never introduces new
 * colours or borders.
 */
export type SectionWeight = "lead" | "primary" | "support";

interface SectionProps {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  weight?: SectionWeight;
  /** Rendered at the far end of the header row (filters, counts, links). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TITLE_SIZE: Record<SectionWeight, string> = {
  lead: "text-2xl sm:text-3xl lg:text-[2.1rem]",
  primary: "text-xl sm:text-2xl",
  support: "text-lg sm:text-xl",
};

const SPACING: Record<SectionWeight, string> = {
  lead: "py-12 sm:py-16",
  primary: "py-10 sm:py-14",
  support: "py-8 sm:py-10",
};

export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  weight = "primary",
  action,
  children,
  className,
}: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-28", SPACING[weight], className)}>
      <header
        data-reveal="hidden"
        className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h2 className={cn("font-extrabold tracking-tight text-balance", TITLE_SIZE[weight])}>
            {title}
          </h2>
          {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed muted">{subtitle}</p>}
        </div>
        {/*
          The action slot holds filter rails that scroll internally. It must be
          allowed to shrink (`min-w-0`), otherwise a long rail pushes the header
          — and therefore the page — wider than the viewport at mid widths.
        */}
        {action && <div className="min-w-0 max-w-full">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Hairline divider that fades at both ends instead of cutting the layout. */
export function Seam({ className }: { className?: string }) {
  return <div className={cn("seam", className)} role="presentation" />;
}
