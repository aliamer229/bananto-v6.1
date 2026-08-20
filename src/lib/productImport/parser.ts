/**
 * Deterministic parser for the `field=value` product import format.
 *
 * Format (identical to the Nintendo Switch Games template so the admin team
 * does not have to learn a second one):
 *
 *   name=Nintendo Switch 2 Pro Controller     simple scalar
 *   description_full<<EOF … EOF               multi-line block
 *   feature.1= / feature.2= …                 repeatable scalar, unbounded
 *   gallery.1.image= / gallery.1.title=       repeatable object, unbounded
 *   spec_group.1.spec.2.value=                nested repeatable objects
 *
 * There is no fixed cap on repetition counts: indices are read from the key
 * itself, so `feature.97=` is as valid as `feature.1=`. Sparse indices are
 * compacted on the way out, which keeps templates forgiving when an admin
 * deletes a middle entry.
 */

import {
  EMPTY_STATS,
  type FieldDef,
  type ImportIssue,
  type ImportStats,
  type ParseResult,
  type ParsedProduct,
  type ProductSchema,
} from "./types";

interface RawPair {
  key: string;
  value: string;
  /** true when the line was `key<<EOF`, so an empty body is still explicit. */
  multiline: boolean;
}

/** Splits the file into raw key/value pairs, honouring `<<EOF` blocks. */
export function tokenize(rawText: string): { pairs: RawPair[]; issues: ImportIssue[] } {
  const pairs: RawPair[] = [];
  const issues: ImportIssue[] = [];
  const lines = (rawText || "").replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) {
      i++;
      continue;
    }

    // Section headings such as `[HARDWARE]` are decorative, not data.
    if (/^\[.*\]$/.test(line)) {
      i++;
      continue;
    }

    const multiline = /^([^=<]+)<<EOF$/.exec(line);
    if (multiline) {
      const key = (multiline[1] ?? "").trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "EOF") {
        body.push(lines[i] ?? "");
        i++;
      }
      if (i >= lines.length) {
        issues.push({
          key,
          message: "كتلة نصية غير مغلقة: ينقصها سطر EOF",
          severity: "error",
        });
      }
      if (key) pairs.push({ key, value: body.join("\n").trim(), multiline: true });
      i++; // consume the EOF line
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) {
      issues.push({
        key: line.slice(0, 60),
        message: "سطر غير صالح (يجب أن يكون key=value أو key<<EOF)",
        severity: "warning",
      });
      i++;
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) pairs.push({ key, value, multiline: false });
    i++;
  }

  return { pairs, issues };
}

interface Ctx {
  issues: ImportIssue[];
  unknown: string[];
  cleared: string[];
  /** Value of the schema's `conditionalOn` field, once seen. */
  conditionalValue?: string;
  schema: ProductSchema;
}

export function parseProductImport(rawText: string, schema: ProductSchema): ParseResult {
  const { pairs, issues } = tokenize(rawText);
  const ctx: Ctx = { issues, unknown: [], cleared: [], schema };

  const byKey = new Map<string, FieldDef>();
  for (const def of schema.fields) byKey.set(def.key, def);

  // Resolve the conditional driver first so `showFor` warnings are accurate
  // regardless of where the field sits in the file.
  if (schema.conditionalOn) {
    const driver = pairs.find((p) => p.key.toLowerCase() === schema.conditionalOn!.toLowerCase());
    if (driver?.value) ctx.conditionalValue = driver.value.toLowerCase();
  }

  const data: ParsedProduct = {};

  for (const pair of pairs) {
    const segments = pair.key.split(".").map((s) => s.trim());
    const head = segments[0] ?? "";
    const def = byKey.get(head);
    if (!def) {
      ctx.unknown.push(pair.key);
      continue;
    }
    if (def.showFor && ctx.conditionalValue && !def.showFor.includes(ctx.conditionalValue)) {
      ctx.issues.push({
        key: pair.key,
        message: `هذا الحقل مخصص للأنواع: ${def.showFor.join("، ")} — سيتم استيراده كما هو`,
        severity: "warning",
      });
    }
    assign(data, def, segments.slice(1), pair, ctx);
  }

  // Required fields must be present *after* the whole file is read.
  for (const def of schema.fields) {
    if (!def.required) continue;
    const current = data[def.target];
    const missing =
      current === undefined || current === "" || (Array.isArray(current) && current.length === 0);
    if (missing) {
      ctx.issues.push({
        key: def.key,
        message: "حقل مطلوب مفقود",
        severity: "error",
      });
    }
  }

  if (schema.fields.some((f) => f.key === "schema_version")) {
    validateSchemaVersion(data, schema, ctx);
  }

  compact(data);

  // Guarantee unique non-empty IDs for options and variants
  if (Array.isArray(data["options"])) {
    data["options"] = (data["options"] as Record<string, unknown>[]).map((opt, idx) => ({
      ...opt,
      id: opt["id"] && String(opt["id"]).trim() ? String(opt["id"]).trim() : `opt_${idx + 1}`,
    }));
  }
  if (Array.isArray(data["variants"])) {
    data["variants"] = (data["variants"] as Record<string, unknown>[]).map((v, idx) => ({
      ...v,
      id: v["id"] && String(v["id"]).trim() ? String(v["id"]).trim() : `typ_${idx + 1}`,
    }));
  }

  return {
    data,
    errors: ctx.issues,
    unknownFields: ctx.unknown,
    stats: countStats(data),
    clearedKeys: ctx.cleared,
  };
}

function validateSchemaVersion(data: ParsedProduct, schema: ProductSchema, ctx: Ctx) {
  const declared = data["schema_version"];
  if (declared === undefined) return; // required-check already covers absence
  const num = Number(declared);
  if (!Number.isFinite(num)) {
    ctx.issues.push({
      key: "schema_version",
      message: "إصدار المخطط يجب أن يكون رقماً",
      severity: "error",
    });
    return;
  }
  if (num > schema.version) {
    ctx.issues.push({
      key: "schema_version",
      message: `الملف يستخدم إصدار مخطط ${num} وهو أحدث من المدعوم (${schema.version})`,
      severity: "error",
    });
  } else if (num < schema.version) {
    ctx.issues.push({
      key: "schema_version",
      message: `إصدار مخطط قديم (${num})، المدعوم حالياً ${schema.version} — سيتم الاستيراد مع ذلك`,
      severity: "warning",
    });
  }
}

/**
 * Writes one raw pair into `container` following `def`, recursing through
 * `itemFields` for nested groups. `segments` are the key parts *after* the one
 * that matched `def`.
 */
function assign(
  container: Record<string, unknown>,
  def: FieldDef,
  segments: string[],
  pair: RawPair,
  ctx: Ctx,
) {
  if (def.repeatable) {
    const indexRaw = segments[0];
    const index = Number.parseInt(indexRaw ?? "", 10);
    if (!indexRaw || Number.isNaN(index) || index < 1) {
      ctx.issues.push({
        key: pair.key,
        message: `يجب تحديد رقم العنصر (مثلاً ${def.key}.1${def.type === "group" ? ".name" : ""})`,
        severity: "error",
      });
      return;
    }

    const existing = container[def.target];
    // A scalar field may share the same target; never index into a string.
    const list = Array.isArray(existing) ? (existing as unknown[]) : [];
    container[def.target] = list;
    const slot = index - 1;

    if (def.type === "group") {
      const entry = (list[slot] as Record<string, unknown>) ?? {};
      list[slot] = entry;
      writeGroupMember(entry, def, segments.slice(1), pair, ctx);
    } else {
      const value = coerce(pair, def, ctx);
      if (value === SKIP) return;
      list[slot] = value;
    }
    return;
  }

  if (def.type === "group") {
    const entry = (container[def.target] as Record<string, unknown>) ?? {};
    container[def.target] = entry;
    writeGroupMember(entry, def, segments, pair, ctx);
    return;
  }

  if (segments.length > 0) {
    ctx.issues.push({
      key: pair.key,
      message: `الحقل ${def.key} لا يقبل عناصر فرعية`,
      severity: "warning",
    });
    return;
  }

  const value = coerce(pair, def, ctx);
  if (value === SKIP) return;
  if (value === CLEAR) {
    ctx.cleared.push(def.target);
    container[def.target] = "";
    return;
  }
  container[def.target] = value;
}

function writeGroupMember(
  entry: Record<string, unknown>,
  def: FieldDef,
  segments: string[],
  pair: RawPair,
  ctx: Ctx,
) {
  const sub = segments[0];
  if (!sub) {
    ctx.issues.push({
      key: pair.key,
      message: `ينقص اسم الحقل الفرعي بعد ${def.key}`,
      severity: "error",
    });
    return;
  }
  const subDef = def.itemFields?.[sub];
  if (!subDef) {
    ctx.unknown.push(pair.key);
    return;
  }
  assign(entry, subDef, segments.slice(1), pair, ctx);
}

/** Sentinels distinguishing "leave untouched" from "explicitly blank". */
const SKIP = Symbol("skip");
const CLEAR = Symbol("clear");

function coerce(pair: RawPair, def: FieldDef, ctx: Ctx): unknown {
  const raw = pair.value;

  if (raw === "") {
    // A template ships with every key blank, so a blank scalar simply means
    // "not provided" — never an error, and never a value that overwrites.
    // Only a multi-line block explicitly opened and left empty clears a field.
    return pair.multiline ? CLEAR : SKIP;
  }

  if (def.validation?.pattern && !def.validation.pattern.test(raw)) {
    ctx.issues.push({
      key: pair.key,
      message: def.validation.patternHint ?? "القيمة لا تطابق الصيغة المطلوبة",
      severity: "error",
    });
    return SKIP;
  }

  switch (def.type) {
    case "string":
    case "multiline":
      return raw;

    case "number":
    case "integer": {
      const n = def.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
      if (!Number.isFinite(n)) {
        ctx.issues.push({
          key: pair.key,
          message: `قيمة رقمية غير صالحة: "${raw}"`,
          severity: "error",
        });
        return SKIP;
      }
      const { min, max } = def.validation ?? {};
      if (min !== undefined && n < min) {
        ctx.issues.push({
          key: pair.key,
          message: `القيمة يجب أن تكون ≥ ${min}`,
          severity: "error",
        });
        return SKIP;
      }
      if (max !== undefined && n > max) {
        ctx.issues.push({
          key: pair.key,
          message: `القيمة يجب أن تكون ≤ ${max}`,
          severity: "error",
        });
        return SKIP;
      }
      return n;
    }

    case "boolean": {
      const v = raw.toLowerCase();
      if (["true", "1", "yes", "نعم"].includes(v)) return true;
      if (["false", "0", "no", "لا"].includes(v)) return false;
      ctx.issues.push({
        key: pair.key,
        message: `قيمة منطقية غير صالحة: "${raw}" (استخدم true أو false)`,
        severity: "error",
      });
      return SKIP;
    }

    case "date": {
      if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) {
        ctx.issues.push({
          key: pair.key,
          message: `تاريخ غير صالح: "${raw}" (الصيغة YYYY-MM-DD)`,
          severity: "error",
        });
        return SKIP;
      }
      const full = raw.length === 4 ? `${raw}-01-01` : raw.length === 7 ? `${raw}-01` : raw;
      if (Number.isNaN(new Date(full).getTime())) {
        ctx.issues.push({ key: pair.key, message: `تاريخ غير موجود: "${raw}"`, severity: "error" });
        return SKIP;
      }
      return full;
    }

    case "url": {
      if (!/^https?:\/\/[^\s]+$/i.test(raw)) {
        ctx.issues.push({
          key: pair.key,
          message: `رابط غير صالح: "${raw}" (يجب أن يبدأ بـ http:// أو https://)`,
          severity: "error",
        });
        return SKIP;
      }
      return raw;
    }

    case "enum": {
      const allowed = def.enumValues ?? [];
      const match = allowed.find((v) => v.toLowerCase() === raw.toLowerCase());
      if (!match) {
        ctx.issues.push({
          key: pair.key,
          message: `قيمة غير معروفة: "${raw}" (المتوقع: ${allowed.join("، ")}) — سيتم حفظها كما هي`,
          severity: "warning",
        });
        return raw;
      }
      return match;
    }

    default:
      return raw;
  }
}

/** Drops holes left by sparse indices and prunes entries that ended up empty. */
function compact(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) compact(item);
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const cleaned = value.filter((v) => v !== undefined && v !== null && v !== "");
      for (const item of cleaned) compact(item);
      const kept = cleaned.filter(
        (v) => typeof v !== "object" || v === null || Object.keys(v as object).length > 0,
      );
      if (kept.length === 0) delete record[key];
      else record[key] = kept;
    } else if (value && typeof value === "object") {
      compact(value);
      if (Object.keys(value as object).length === 0) delete record[key];
    }
  }
}

function countStats(data: ParsedProduct): ImportStats {
  const groups = (data["specGroups"] as { specs?: unknown[] }[] | undefined) ?? [];
  const arrayLen = (key: string) => ((data[key] as unknown[] | undefined) ?? []).length;
  const mediaKeys = [
    "mainImage",
    "listingImage",
    "coverImage",
    "thumbnailImage",
    "bannerImage",
    "packagingFrontImage",
    "packagingBackImage",
    "frontImage",
    "backImage",
    "leftImage",
    "rightImage",
    "closeUpImage",
    "baseImage",
    "lifestyleImages",
  ];
  const singleMedia = mediaKeys.filter((k) => typeof data[k] === "string" && data[k]).length;
  const listMedia = mediaKeys.reduce(
    (sum, k) => sum + (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0),
    0,
  );

  return {
    ...EMPTY_STATS,
    fields: Object.keys(data).length,
    specGroups: groups.length,
    specs: groups.reduce((sum, g) => sum + (g.specs?.length ?? 0), 0),
    media: singleMedia + listMedia + arrayLen("gallery"),
    videos: arrayLen("videos"),
    variants: arrayLen("variants"),
    options: arrayLen("options"),
    compatibility: arrayLen("compatibility") + arrayLen("gameCompatibility"),
    sources: arrayLen("sources"),
    faq: arrayLen("faq"),
  };
}
