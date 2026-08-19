/**
 * Re-import strategy.
 *
 * Re-importing a product must never silently wipe work someone did in the admin
 * form. The template ships with every key blank, so "absent" and "blank" both
 * mean *the file has nothing to say about this field* — the stored value wins.
 * Clearing is therefore explicit: open the multi-line block and leave it empty
 * (`notes<<EOF` / `EOF`), which the parser records in `clearedKeys`.
 *
 *   field present with a value  → overwrite
 *   field absent / blank scalar → keep the existing value
 *   explicit empty EOF block    → clear
 */

import type { ParseResult, ParsedProduct } from "./types";

export interface MergeSummary {
  updated: string[];
  kept: string[];
  cleared: string[];
  added: string[];
}

export function mergeImportedProduct(
  existing: ParsedProduct | undefined,
  result: ParseResult,
): { product: ParsedProduct; summary: MergeSummary } {
  const base: ParsedProduct = { ...(existing ?? {}) };
  const summary: MergeSummary = { updated: [], kept: [], cleared: [], added: [] };
  const cleared = new Set(result.clearedKeys);

  for (const [key, value] of Object.entries(result.data)) {
    if (cleared.has(key)) {
      if (base[key] !== undefined) summary.cleared.push(key);
      delete base[key];
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (base[key] === undefined) summary.added.push(key);
    else if (!sameValue(base[key], value)) summary.updated.push(key);
    base[key] = value;
  }

  for (const key of Object.keys(existing ?? {})) {
    if (!(key in result.data) && !cleared.has(key)) summary.kept.push(key);
  }

  return { product: base, summary };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
