"use client";

import { CATEGORIES, type CategoryId } from "@/lib/problems/types";

export type CategoryFilterValue = CategoryId | "all";

/**
 * Category chips. Rendered as a labelled group of toggle buttons so keyboard
 * and screen-reader users get the same "one active filter" model that the
 * visual design communicates.
 */
export function CategoryFilter({
  value,
  onChange,
  counts,
}: {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
  counts: Record<CategoryId, number>;
}) {
  const options: Array<{
    id: CategoryFilterValue;
    label: string;
    emoji: string;
    count: number;
  }> = [
    // -1 suppresses the count badge on "الكل".
    { id: "all", label: "الكل", emoji: "🍌", count: -1 },
    ...CATEGORIES.map((category) => ({
      id: category.id as CategoryFilterValue,
      label: category.label,
      emoji: category.emoji,
      count: counts[category.id],
    })),
  ];

  return (
    <div
      role="group"
      aria-label="تصفية المشاكل حسب الفئة"
      className="bn-scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
    >
      {options.map((option) => {
        // Hide categories that have no published content rather than offering a
        // filter that leads to an empty page.
        if (option.id !== "all" && option.count === 0) return null;

        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className="bn-chip shrink-0"
          >
            <span aria-hidden>{option.emoji}</span>
            {option.label}
            {option.count >= 0 && (
              <span
                className={`ltr rounded-pill px-1.5 text-xs font-bold ${
                  active ? "bg-primary/25 text-primary-foreground" : "text-muted-foreground/60"
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
