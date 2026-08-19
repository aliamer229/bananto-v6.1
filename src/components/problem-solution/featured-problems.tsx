"use client";

import { Reveal } from "@/components/motion/reveal";
import { CATEGORY_MAP, type Problem } from "@/lib/problems/types";

/**
 * "المشاكل الأكثر شيوعًا" — quick jumps straight to a solution, for the large
 * share of visitors whose problem is one of a handful of common ones.
 */
export function FeaturedProblems({
  problems,
  onJump,
  title = "المشاكل الأكثر شيوعًا",
  subtitle,
}: {
  problems: Problem[];
  onJump: (id: string) => void;
  title?: string;
  subtitle?: string;
}) {
  if (problems.length === 0) return null;

  return (
    <section aria-labelledby="featured-title" className="py-2">
      <Reveal className="mb-4 text-center">
        <h2 id="featured-title" className="text-xl font-extrabold text-foreground sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </Reveal>

      {/* minmax(0,1fr) keeps the truncating title from forcing the column wider
          than the viewport — an `auto` column would size to its min-content. */}
      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {problems.map((problem, index) => (
          <Reveal as="li" key={problem.id} delay={index * 60} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(problem.id)}
              className="group flex h-full w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-right transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-1 hover:border-primary hover:shadow-card"
            >
              <span
                aria-hidden
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/50 bg-primary/20 text-2xl transition-transform duration-300 ease-pop group-hover:scale-110"
              >
                {problem.emoji}
              </span>

              <span className="min-w-0 flex-1">
                {/* line-clamp, not truncate: clipping a single line cuts Latin
                    words mid-token inside RTL text ("eShop" → "hop…"). */}
                <span className="line-clamp-2 block font-display font-bold text-foreground">
                  {problem.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {CATEGORY_MAP[problem.category].label}
                </span>
              </span>

              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-muted-foreground/60 transition-[transform,color] duration-300 group-hover:-translate-x-1 group-hover:text-primary-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
