/**
 * Turning a parsed template into the shape the product form and the save
 * endpoint expect.
 *
 * This used to be an inline closure inside the product editor, which meant the
 * only way to import a hardware or gift-card file was to sit in front of the
 * screen and do it one at a time. The batch ZIP importer has to produce
 * byte-identical products from the same file, so the normalisation lives here
 * and both callers run the same code — the same arrangement the Nintendo path
 * already has in `gameImportForm.ts`.
 *
 * Nothing here reads a template; it takes what the parser produced.
 */

import { boxContentsToText } from "../boxContentsText";
import { toStepList } from "../stepsText";
import { mergeImportedProduct } from "./merge";
import type { ParseResult, ProductSchema } from "./types";

/**
 * Merges a parsed file onto an existing form and normalises the result.
 *
 * `previous` is the form being edited, or a bare object with just a category
 * for a product that does not exist yet. Re-import semantics come from
 * `mergeImportedProduct`: a blank field in the file leaves the stored value
 * alone, and only an explicit empty `<<EOF` block clears one.
 */
export function applySchemaImportToForm(
  previous: Record<string, any>,
  result: ParseResult,
  schema: ProductSchema,
): Record<string, any> {
  const prev = previous ?? {};
  const activeSchema = schema;
  const { product } = mergeImportedProduct(prev, result);
  const normalized: any = {
    ...product,
    schemaId: activeSchema.id,
    kind: product["kind"] || activeSchema.kind,
    category: product["category"] || prev.category || activeSchema.categoryId,
  };

  // Ensure options have unique ids
  if (Array.isArray(normalized.options)) {
    normalized.options = normalized.options.filter(Boolean).map((opt: any, idx: number) => ({
      ...opt,
      id: opt.id && String(opt.id).trim() ? String(opt.id).trim() : `opt_${Date.now()}_${idx}`,
    }));
  }

  // An imported template fills `variants`; the panel edits `types`.
  if (
    (!Array.isArray(normalized.types) || normalized.types.length === 0) &&
    Array.isArray(normalized.variants) &&
    normalized.variants.length > 0
  ) {
    normalized.types = normalized.variants;
  }

  // Ensure types have unique ids
  if (Array.isArray(normalized.types)) {
    normalized.types = normalized.types.filter(Boolean).map((t: any, idx: number) => ({
      ...t,
      id: t.id && String(t.id).trim() ? String(t.id).trim() : `typ_${Date.now()}_${idx}`,
    }));
  } else if (Array.isArray(normalized.variants)) {
    normalized.types = normalized.variants.filter(Boolean).map((t: any, idx: number) => ({
      ...t,
      id: t.id && String(t.id).trim() ? String(t.id).trim() : `typ_${Date.now()}_${idx}`,
    }));
  }

  if (Array.isArray(normalized.boxContents)) {
    normalized.boxContentsList = normalized.boxContents;
  }
  normalized.boxContentsText =
    boxContentsToText(normalized.boxContents) ||
    boxContentsToText(normalized.boxContentsText) ||
    boxContentsToText(prev.boxContentsText ?? prev.boxContents) ||
    "";

  if (!normalized.warrantyCondition) {
    normalized.warrantyCondition =
      [normalized.warranty, normalized.warrantyType, normalized.warrantyNotes]
        .filter((part: unknown) => typeof part === "string" && part.trim())
        .join(" — ") ||
      prev.warrantyCondition ||
      "";
  }

  // Redemption / setup instructions become an ordered list.
  const importedSteps = toStepList(normalized.redemptionSteps ?? normalized.redemptionGuide);
  if (importedSteps.length) {
    normalized.redemptionSteps = importedSteps;
    normalized.redemptionGuide = importedSteps.join("\n");
  }

  if (!normalized.coverImage) {
    normalized.coverImage = normalized.cardArtwork || normalized.mainImage || prev.coverImage || "";
  }

  // Front-cover sources only. A banner, or the *back* of the box,
  // is never promoted into the canonical front-cover field.
  if (!normalized.cartridgeImage) {
    normalized.cartridgeImage =
      normalized.packagingFrontImage || normalized.boxImage || prev.cartridgeImage || "";
  }

  return normalized;
}
