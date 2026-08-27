/**
 * What a parsed import file actually contains, judged against its schema.
 *
 * Import stays fault-tolerant — nothing here rejects a file. The point is that
 * "imported successfully" was never an honest summary: a template with the
 * name and the price filled in and nothing else imports exactly as cleanly as a
 * fully researched one, and the admin had no way to tell the two apart until
 * the product page turned out to be three lines long.
 *
 * So every field carries a level (see {@link FieldLevel}) and this module turns
 * a `ParseResult` into the report the importer shows before saving:
 *
 *     المطلوب      18/18
 *     الموصى به    32/40
 *     الاختياري    24 حقلاً مملوءاً
 *
 * Two rules keep the numbers meaningful:
 *
 *  1. **Conditional fields count only when they apply.** A charger is not
 *     missing `hall_effect`; that field belongs to controllers. Anything whose
 *     `showFor` excludes the file's own `accessory_type` is left out of both
 *     the numerator and the denominator.
 *  2. **A blank is a blank, whatever its shape.** An empty string, an empty
 *     array and an array of empty strings all count as absent, because all
 *     three render as nothing on the product page.
 */

import type { FieldDef, FieldLevel, ParsedProduct, ProductSchema } from "./types";

export interface QualityCounter {
  present: number;
  total: number;
  /** Template keys still blank, so the admin can fill exactly those. */
  missing: string[];
}

export interface QualityReport {
  required: QualityCounter;
  recommended: QualityCounter;
  /** Optional fields carrying a value — a count only; absence is never a warning. */
  optionalPopulated: number;
  /** Distinct image URLs the file provides across every media role. */
  media: number;
  sources: number;
  /**
   * Arabic, admin-facing, and never blocking. Missing required fields appear
   * here too, so one list is the whole story.
   */
  warnings: string[];
  /** True when nothing required is missing. */
  complete: boolean;
}

/** A field's level, derived from `required` when the schema does not spell it out. */
export function fieldLevel(def: FieldDef): FieldLevel {
  if (def.level) return def.level;
  return def.required ? "required" : "optional";
}

/** Does this field apply to the product being imported? */
export function fieldApplies(def: FieldDef, schema: ProductSchema, data: ParsedProduct): boolean {
  if (!def.showFor || !schema.conditionalOn) return true;
  const driver = schema.fields.find((f) => f.key === schema.conditionalOn);
  if (!driver) return true;
  const value = String(data[driver.target] ?? "")
    .trim()
    .toLowerCase();
  // With the driver itself unset nothing can be ruled out, so conditional
  // fields stay optional rather than being counted as missing.
  if (!value) return false;
  return def.showFor.some((allowed) => allowed.toLowerCase() === value);
}

/** Does the parsed record carry anything for this field? */
export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((entry) => hasValue(entry));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) => hasValue(entry));
  }
  return false;
}

const MEDIA_TARGETS = [
  "mainImage",
  "listingImage",
  "coverImage",
  "thumbnailImage",
  "bannerImage",
  "frontImage",
  "backImage",
  "leftImage",
  "rightImage",
  "packagingFrontImage",
  "packagingBackImage",
  "closeUpImage",
  "cardArtwork",
  "regionBanner",
];

function countMedia(data: ParsedProduct): number {
  const urls = new Set<string>();
  for (const target of MEDIA_TARGETS) {
    const value = data[target];
    if (typeof value === "string" && value.trim()) urls.add(value.trim());
  }
  for (const entry of (data["lifestyleImages"] as unknown[] | undefined) ?? []) {
    if (typeof entry === "string" && entry.trim()) urls.add(entry.trim());
  }
  for (const entry of (data["gallery"] as Record<string, unknown>[] | undefined) ?? []) {
    const url = entry?.["url"];
    if (typeof url === "string" && url.trim()) urls.add(url.trim());
  }
  return urls.size;
}

/**
 * Media roles a product page reads first. Missing one of these is what produces
 * a placeholder in a listing card, so it is called out by name rather than
 * hidden inside a total.
 */
const MEDIA_WARNINGS: { target: string; label: string }[] = [
  { target: "mainImage", label: "الصورة الرئيسية (main_image)" },
  { target: "listingImage", label: "صورة البطاقة في القوائم (listing_image)" },
];

export function buildQualityReport(data: ParsedProduct, schema: ProductSchema): QualityReport {
  const required: QualityCounter = { present: 0, total: 0, missing: [] };
  const recommended: QualityCounter = { present: 0, total: 0, missing: [] };
  let optionalPopulated = 0;

  for (const def of schema.fields) {
    if (def.key === "schema_version") continue;
    const level = fieldLevel(def);
    if (level !== "required" && !fieldApplies(def, schema, data)) continue;

    const present = hasValue(data[def.target]);
    if (level === "optional") {
      if (present) optionalPopulated++;
      continue;
    }
    const counter = level === "required" ? required : recommended;
    counter.total++;
    if (present) counter.present++;
    else counter.missing.push(def.key);
  }

  const warnings: string[] = [];
  for (const key of required.missing) {
    warnings.push(`حقل مطلوب فارغ: ${key}`);
  }
  for (const key of recommended.missing) {
    warnings.push(`حقل موصى به فارغ: ${key}`);
  }
  for (const { target, label } of MEDIA_WARNINGS) {
    if (!hasValue(data[target])) warnings.push(`صورة ناقصة: ${label}`);
  }
  if (!hasValue(data["sources"])) {
    warnings.push("لا توجد مصادر موثّقة (source.N.url) — أضف مصدراً رسمياً واحداً على الأقل");
  }

  return {
    required,
    recommended,
    optionalPopulated,
    media: countMedia(data),
    sources: ((data["sources"] as unknown[] | undefined) ?? []).length,
    warnings,
    complete: required.missing.length === 0,
  };
}
