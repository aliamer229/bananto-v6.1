/**
 * Shared vocabulary for the deterministic product import pipeline.
 *
 * The Nintendo Switch Games importer (`src/lib/gameImportSchema.ts`) proved the
 * `field=value` / `field<<EOF` template format works well for the admin team, so
 * the newer sections (hardware, amiibo, accessories) reuse it verbatim. What
 * changes here is the *shape* of a schema: instead of a flat list that only
 * understands `key.N.sub=`, a `FieldDef` may nest to any depth, which is what
 * lets a template express dynamic specification groups:
 *
 *     spec_group.1.name=
 *     spec_group.1.spec.2.value=
 *
 * Nothing in this module is section-specific — hardware, amiibo and accessory
 * schemas are all just `FieldDef[]`, and the parser/generator/merger treat them
 * identically.
 */

export type FieldType =
  "string" | "multiline" | "number" | "integer" | "boolean" | "date" | "url" | "enum" | "group";

export interface FieldValidation {
  min?: number;
  max?: number;
  /** Applied to the raw string; failures are reported as errors. */
  pattern?: RegExp;
  patternHint?: string;
}

export interface FieldDef {
  /** Key as written in the import file, e.g. `spec_group`. */
  key: string;
  type: FieldType;
  /** Property name produced in the parsed object. */
  target: string;
  required?: boolean;
  /** Accepts `key.1=`, `key.2=`, … and produces an array. */
  repeatable?: boolean;
  /** Sub-fields, required when `type === "group"`. */
  itemFields?: Record<string, FieldDef>;
  /** Allowed values for `type === "enum"`; unknown values become warnings. */
  enumValues?: readonly string[];
  validation?: FieldValidation;
  /** Arabic comment written above the field in the generated template. */
  description?: string;
  /** Section heading in the generated template. */
  group?: string;
  /** Sample value shown in the template comment. */
  example?: string;
  /** How many blank repetitions the generated template should offer. */
  templateCount?: number;
  /**
   * Accessory-style conditional field: only meaningful when `accessory_type`
   * (or the schema's `conditionalOn` field) has one of these values. Purely
   * advisory — importing it anyway is allowed, it just gets a warning.
   */
  showFor?: readonly string[];
  /**
   * i18n key suffix under the `specs` namespace. Lets the storefront render a
   * localized label instead of the raw English field name.
   */
  specKey?: string;
  /** Physical unit rendered next to the value (kg, mm, W, …). Never translated. */
  unit?: string;
}

export type Severity = "error" | "warning";

export interface ImportIssue {
  key: string;
  message: string;
  severity: Severity;
}

export interface ParsedProduct {
  [key: string]: unknown;
}

export interface ImportStats {
  fields: number;
  specGroups: number;
  specs: number;
  media: number;
  videos: number;
  variants: number;
  options: number;
  compatibility: number;
  sources: number;
  faq: number;
}

export interface ParseResult {
  data: ParsedProduct;
  /** Errors *and* warnings, matching the shape the game importer already uses. */
  errors: ImportIssue[];
  unknownFields: string[];
  stats: ImportStats;
  /** Keys the file set to an explicit empty value — used by the merge strategy. */
  clearedKeys: string[];
}

export interface ProductSchema {
  /** Stable id used in URLs, template file names and the schema registry. */
  id: string;
  /** Current schema version; import files declare `schema_version`. */
  version: number;
  /** Arabic label shown in the admin UI. */
  label: string;
  /** i18n key for the section label. */
  labelKey: string;
  /** Default store category the importer assigns when the file omits one. */
  categoryId: string;
  /** Product `kind` written onto the imported record. */
  kind: string;
  /** Generated template file name under `public/templates/`. */
  templateFile: string;
  /** Field whose value drives `showFor` filtering, if any. */
  conditionalOn?: string;
  fields: FieldDef[];
}

export const EMPTY_STATS: ImportStats = {
  fields: 0,
  specGroups: 0,
  specs: 0,
  media: 0,
  videos: 0,
  variants: 0,
  options: 0,
  compatibility: 0,
  sources: 0,
  faq: 0,
};
