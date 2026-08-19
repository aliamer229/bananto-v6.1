"use client";

import { Reveal } from "@/components/motion/reveal";
import type { SearchResult } from "@/lib/search/engine";
import { highlight } from "@/lib/search/highlight";
import { CATEGORY_MAP } from "@/lib/problems/types";

/**
 * Live result list. Rendered inline under the search bar — no navigation, no
 * page reload — with a match percentage and the matched words highlighted.
 */
export function SearchResults({
  results,
  onJump,
  pending,
}: {
  results: SearchResult[];
  onJump: (id: string) => void;
  pending: boolean;
}) {
  if (pending) return <ResultsSkeleton />;

  return (
    <section aria-labelledby="results-title" className="py-2">
      <h2
        id="results-title"
        className="mb-4 text-center text-lg font-extrabold text-foreground sm:text-xl"
      >
        <span aria-hidden className="ml-1.5">
          ✅
        </span>
        وجدنا {results.length} {results.length === 1 ? "حلًا" : "حلول"} لمشكلتك
      </h2>

      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0">
        {results.map((result, index) => (
          <Reveal as="li" key={result.problem.id} delay={index * 50} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(result.problem.id)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-right transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary hover:shadow-card sm:gap-4 sm:p-4"
            >
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/50 bg-primary/20 text-xl transition-transform duration-300 ease-pop group-hover:scale-110"
              >
                {result.problem.emoji}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold text-balance text-foreground">
                  {highlight(result.problem.title, result.matched)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {CATEGORY_MAP[result.problem.category].label}
                </span>
              </span>

              <MatchBadge percent={result.percent} />
            </button>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

function MatchBadge({ percent }: { percent: number }) {
  const strong = percent >= 80;
  return (
    <span
      className={`hidden shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 sm:flex ${
        strong
          ? "border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
          : "border-border bg-background text-muted-foreground"
      }`}
    >
      <span className="ltr font-mono text-sm font-bold">{percent}%</span>
      <span className="text-[0.65rem] leading-none">مطابقة</span>
    </span>
  );
}

function ResultsSkeleton() {
  return (
    <div className="py-2" aria-hidden>
      <div className="bn-skeleton mx-auto mb-4 h-6 w-56" />
      <div className="grid gap-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
          >
            <div className="bn-skeleton h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="bn-skeleton h-4 w-2/3" />
              <div className="bn-skeleton h-3 w-1/4" />
            </div>
            <div className="bn-skeleton h-10 w-14 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
