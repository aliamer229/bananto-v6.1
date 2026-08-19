import raw from "@/content/problems.json";
import { CATEGORY_IDS, type CategoryId, type Problem, problemCategories } from "./types";

/**
 * Single entry point for troubleshooting content.
 *
 * Today it reads `content/problems.json`. Swapping in a CMS or database later
 * means changing only the body of `loadProblems()` — the page, the search
 * engine and the public API all consume this module, never the JSON directly.
 * The function is async on purpose so that swap stays a drop-in.
 */

const CATEGORY_SET = new Set<string>(CATEGORY_IDS);

/** Guards against a bad hand-edit of the JSON reaching the UI. */
function assertValid(entry: Problem, index: number): Problem {
  const where = `content/problems.json[${index}]`;

  if (!entry.id || !/^[A-Z0-9_]+$/.test(entry.id)) {
    throw new Error(
      `${where}: "id" must be an uppercase slug (used as the URL hash), got "${entry.id}"`,
    );
  }
  if (!CATEGORY_SET.has(entry.category)) {
    throw new Error(`${where}: unknown category "${entry.category}"`);
  }
  for (const extra of entry.alsoIn ?? []) {
    if (!CATEGORY_SET.has(extra)) {
      throw new Error(`${where}: unknown category in alsoIn "${extra}"`);
    }
  }
  if (entry.steps.length === 0) {
    throw new Error(`${where}: a problem must have at least one solution step`);
  }
  for (const image of entry.images) {
    if (!image.alt.trim()) {
      throw new Error(`${where}: image "${image.src}" is missing alt text`);
    }
  }
  return entry;
}

async function loadProblems(): Promise<Problem[]> {
  const entries = raw as unknown as Problem[];
  const seen = new Set<string>();
  const images = new Map<string, string>();

  const allIds = new Set(entries.map((entry) => entry.id));

  return entries.map((entry, index) => {
    const problem = assertValid(entry, index);

    if (seen.has(problem.id)) {
      throw new Error(`Duplicate problem id "${problem.id}"`);
    }
    seen.add(problem.id);

    // `relatedErrors` is scored as literal error codes at the highest weight,
    // so another problem's ID in there silently hijacks that problem's search
    // ranking. Cross-references do not belong in this field.
    for (const code of problem.relatedErrors) {
      if (code !== problem.id && allIds.has(code)) {
        throw new Error(
          `"${problem.id}" lists the problem ID "${code}" in relatedErrors. That field is for error codes users type, not cross-references.`,
        );
      }
    }

    // An image belongs to exactly one problem. Reusing a "close enough"
    // illustration across problems is the failure mode this guards against.
    for (const image of problem.images) {
      const owner = images.get(image.src);
      if (owner && owner !== problem.id) {
        throw new Error(
          `Image "${image.src}" is used by both "${owner}" and "${problem.id}". Each problem needs its own image.`,
        );
      }
      images.set(image.src, problem.id);
    }

    return problem;
  });
}

/** Published problems, most important first. */
export async function getPublishedProblems(): Promise<Problem[]> {
  const problems = await loadProblems();
  return problems
    .filter((problem) => problem.published)
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

export async function getProblemById(id: string): Promise<Problem | undefined> {
  const problems = await getPublishedProblems();
  return problems.find((problem) => problem.id === id);
}

/** Categories that actually have published content, with their counts. */
export async function getCategoryCounts(): Promise<Record<CategoryId, number>> {
  const problems = await getPublishedProblems();
  const counts = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as Record<
    CategoryId,
    number
  >;

  for (const problem of problems) {
    for (const category of problemCategories(problem)) {
      counts[category] += 1;
    }
  }
  return counts;
}
