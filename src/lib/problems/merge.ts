import type { ProblemEntry } from "../content";
import { CATEGORY_IDS, type CategoryId, type Problem } from "./types";

const CATEGORY_SET = new Set<string>(CATEGORY_IDS);

/** Turns an admin-authored entry into the full problem shape the page renders. */
export function entryToProblem(entry: ProblemEntry): Problem {
  const category: CategoryId = CATEGORY_SET.has(entry.category)
    ? (entry.category as CategoryId)
    : "other";

  return {
    id: entry.id,
    emoji: entry.emoji || "❓",
    title: entry.title,
    description: entry.description,
    category,
    cause: entry.cause ?? "",
    keywords: entry.keywords ?? [],
    aliases: [],
    symptoms: [],
    images: entry.imageUrl
      ? [
          {
            src: entry.imageUrl,
            alt: entry.title,
            kind: "illustration" as const,
            width: 1200,
            height: 800,
          },
        ]
      : [],
    steps: (entry.steps ?? []).map((step: { title: string; description: string }) => ({
      title: step.title,
      detail: step.description,
    })),
    relatedGames: [],
    relatedProducts: [],
    relatedErrors: [],
    arabicKeywords: entry.keywords ?? [],
    englishKeywords: [],
    kurdishKeywords: [],
    priority: 50,
    published: entry.published ?? true,
  };
}

/**
 * Admin entries win over the shipped JSON when IDs match, so an admin can both
 * override a built-in problem and publish brand new ones.
 */
export function applyProblemOverrides(base: Problem[], entries: ProblemEntry[]): Problem[] {
  const byId = new Map(base.map((problem) => [problem.id, problem]));
  for (const entry of entries) {
    if (!entry?.id || !entry.title) continue;
    byId.set(entry.id, entryToProblem(entry));
  }
  return [...byId.values()]
    .filter((problem) => problem.published)
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

export function countCategories(problems: Problem[]): Record<CategoryId, number> {
  const counts = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as Record<
    CategoryId,
    number
  >;
  for (const problem of problems) {
    for (const category of [problem.category, ...(problem.alsoIn ?? [])]) {
      counts[category] += 1;
    }
  }
  return counts;
}
