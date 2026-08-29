/**
 * The slug rules, in a module a browser can import.
 *
 * These used to live inside the products route, which meant the only way to
 * know what slug a product would get was to save it and see. The batch
 * importer's dry run has to predict that answer before it writes anything, and
 * a second copy of the rule would drift from the endpoint's within a release —
 * so the endpoint imports these rather than the other way round.
 */

/**
 * The slug a title becomes.
 *
 * A title with no Latin characters at all — an Arabic-only name — cleans down
 * to nothing, so the id is the fallback; that is why a product can end up
 * called `product-<id>` rather than being rejected.
 */
export function sanitizeSlug(input: string, fallbackId: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned) return cleaned;
  const fallbackClean = fallbackId.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `product-${fallbackClean || Date.now().toString(36)}`;
}

/**
 * A free slug for a copy of a product that already exists.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((value) => String(value).toLowerCase()));
  if (!used.has(desired.toLowerCase())) return desired;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${desired}-${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${desired}-${Date.now().toString(36)}`;
}
