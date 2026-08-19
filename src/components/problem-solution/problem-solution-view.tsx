"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Hero } from "./hero";
import { SearchPanel } from "./search-panel";
import { CategoryFilter, type CategoryFilterValue } from "./category-filter";
import { FeaturedProblems } from "./featured-problems";
import { SearchResults } from "./search-results";
import { ProblemSection } from "./problem-section";
import { NoProblemsState, NoResultsState } from "./empty-state";
import { HelpCta } from "./help-cta";
import { ImageLightbox } from "./image-lightbox";
import { BananaBackdrop } from "./banana-backdrop";
import { Reveal, prefersReducedMotion } from "@/components/motion/reveal";
import { buildIndex, search } from "@/lib/search/engine";
import {
  problemCategories,
  type CategoryId,
  type Problem,
  type ProblemImage,
} from "@/lib/problems/types";

interface VisibleEntry {
  problem: Problem;
  /** Query tokens to highlight in this problem's title. */
  matched: string[];
}

export function ProblemSolutionView({
  problems,
  counts,
}: {
  problems: Problem[];
  counts: Record<CategoryId, number>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilterValue>("all");
  const [lightboxImage, setLightboxImage] = useState<ProblemImage | null>(null);
  /** The problem a deep link or a result click sent us to. */
  const [target, setTarget] = useState<{ id: string; nonce: number } | null>(null);

  // Keeps typing responsive: the input updates instantly, scoring catches up.
  const deferredQuery = useDeferredValue(query);
  const isSearching = query.trim().length > 0;
  const isPending = isSearching && query !== deferredQuery;

  const index = useMemo(() => buildIndex(problems), [problems]);

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim();
    return trimmed ? search(index, trimmed) : null;
  }, [index, deferredQuery]);

  const matchesCategory = useCallback(
    (problem: Problem) => category === "all" || problemCategories(problem).includes(category),
    [category],
  );

  /** Search order when searching, priority order otherwise. */
  const visible = useMemo<VisibleEntry[]>(() => {
    if (results) {
      return results
        .filter((result) => matchesCategory(result.problem))
        .map((result) => ({ problem: result.problem, matched: result.matched }));
    }
    return problems.filter(matchesCategory).map((problem) => ({ problem, matched: [] }));
  }, [results, problems, matchesCategory]);

  const featured = useMemo(
    () => problems.filter((problem) => problem.featured).slice(0, 6),
    [problems],
  );

  /** Clears filters so the target is guaranteed to be rendered, then scrolls. */
  const jumpTo = useCallback((id: string) => {
    setQuery("");
    setCategory("all");
    setTarget({ id, nonce: Date.now() });
  }, []);

  // Runs after commit, so the section is in the DOM by the time we look it up.
  useEffect(() => {
    if (!target) return;

    const element = document.getElementById(target.id);
    if (!element) return;

    element.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });

    if (window.location.hash !== `#${target.id}`) {
      window.history.replaceState(null, "", `#${target.id}`);
    }

    // Fade the highlight ring out once the user has had time to see it.
    const timer = window.setTimeout(() => {
      setTarget((current) => (current && current.nonce === target.nonce ? null : current));
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [target]);

  // Deep links: /problem_solution#LOGIN_001, including links sent by the
  // support bot while the page is already open.
  useEffect(() => {
    const known = new Set(problems.map((problem) => problem.id));

    const applyHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (id && known.has(id)) jumpTo(id);
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [problems, jumpTo]);

  if (problems.length === 0) {
    return (
      <div className="relative">
        <BananaBackdrop />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <Hero problemCount={0} />
          <NoProblemsState />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <BananaBackdrop />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <Hero problemCount={problems.length} />

        <SearchPanel
          value={query}
          onChange={setQuery}
          resultCount={results ? results.length : null}
        />

        <div className="mt-6 space-y-8">
          {/* ── Search results, or the popular strip when idle ─────── */}
          {isSearching ? (
            results && results.length > 0 ? (
              <SearchResults results={results} onJump={jumpTo} pending={isPending} />
            ) : isPending ? (
              <SearchResults results={[]} onJump={jumpTo} pending />
            ) : (
              <>
                <NoResultsState query={query} onReset={() => setQuery("")} />
                <FeaturedProblems
                  problems={featured}
                  onJump={jumpTo}
                  title="جرّب المشاكل الأكثر شيوعًا"
                />
              </>
            )
          ) : (
            <FeaturedProblems
              problems={featured}
              onJump={jumpTo}
              subtitle="اضغط على أي مشكلة للانتقال مباشرة إلى حلها."
            />
          )}

          {/* ── Categories ──────────────────────────────────────────── */}
          <Reveal>
            <CategoryFilter value={category} onChange={setCategory} counts={counts} />
          </Reveal>
        </div>

        {/* ── Solutions ─────────────────────────────────────────────── */}
        <div className="mt-4">
          <h2 className="sr-only">قائمة الحلول</h2>

          {visible.length === 0 ? (
            <Reveal className="py-14 text-center">
              <span aria-hidden className="block text-5xl">
                🍌
              </span>
              <p className="mt-4 text-lg font-bold text-foreground">
                ماكو مشاكل في هذه الفئة حاليًا
              </p>
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="bn-btn bn-btn-ghost mt-4"
              >
                اعرض كل المشاكل
              </button>
            </Reveal>
          ) : (
            visible.map((entry, position) => (
              <ProblemSection
                key={entry.problem.id}
                problem={entry.problem}
                index={position}
                matchedTokens={entry.matched}
                onOpenImage={setLightboxImage}
                isTargeted={target?.id === entry.problem.id}
              />
            ))
          )}
        </div>

        <HelpCta />
      </div>

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
}
