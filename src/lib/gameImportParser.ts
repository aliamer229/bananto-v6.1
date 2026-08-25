import { GAME_IMPORT_SCHEMA, FieldDef } from "./gameImportSchema";
import { validateImageUrlShape } from "./imageValidation";
import { getTextValue } from "./utils";
import { str } from "./hub";
import { validateGameDevicePerformance } from "./devicePerformance";

export interface ParseResult {
  data: Record<string, any>;
  errors: Array<{ key: string; message: string; severity: "error" | "warning" }>;
  unknownFields: string[];
}

export function parseGameImport(rawText: string): ParseResult {
  const result: ParseResult = { data: {}, errors: [], unknownFields: [] };
  const lines = (rawText || "").replace(/\r\n/g, "\n").split("\n");
  const rawPairs: Record<string, string> = {};

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i] || "";
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) {
      i++;
      continue;
    }

    // Section headings such as `[GAME]`, `[IMPORT]`, `[DESCRIPTION]` are decorative, not data.
    if (/^\[.*\]$/.test(line)) {
      i++;
      continue;
    }

    // Check for multiline syntax: key<<EOF
    const multilineMatch = line.match(/^([^=]+)<<([A-Za-z0-9_]+)$/);
    if (multilineMatch) {
      const key = multilineMatch[1]?.trim();
      if (key) {
        let content = "";
        i++;
        const eofMarker = multilineMatch[2];
        while (i < lines.length && lines[i]?.trim() !== eofMarker) {
          content += (lines[i] || "") + "\n";
          i++;
        }
        rawPairs[key] = content.trim();
      }
      i++; // Skip EOF line
      continue;
    }

    // Standard key=value
    const eqIndex = line.indexOf("=");
    if (eqIndex !== -1) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (key) {
        rawPairs[key] = value;
      }
    } else {
      // Potentially malformed line
      if (line.length > 0) {
        result.errors.push({
          key: line,
          message: "سطر غير صالح (يجب أن يكون key=value أو key<<EOF)",
          severity: "warning",
        });
      }
    }
    i++;
  }

  // Map raw pairs to schema
  const structuredData: Record<string, any> = {};

  for (const [rawKey, value] of Object.entries(rawPairs)) {
    const key = rawKey.toLowerCase();
    const fieldDef = findFieldDef(key);
    if (!fieldDef) {
      result.unknownFields.push(key);
      continue;
    }

    const { baseKey, indices } = parseKeyPath(key);
    setValueByPath(structuredData, baseKey, indices, value, fieldDef, result);
  }

  // Post-process options and types to guarantee unique non-empty ids
  if (Array.isArray(structuredData.options)) {
    structuredData.options = structuredData.options
      .filter(Boolean)
      .map((opt: any, idx: number) => ({
        ...opt,
        id: opt.id && String(opt.id).trim() ? String(opt.id).trim() : `opt_${idx + 1}`,
      }));
  }
  if (Array.isArray(structuredData.types)) {
    structuredData.types = structuredData.types.filter(Boolean).map((t: any, idx: number) => ({
      ...t,
      id: t.id && String(t.id).trim() ? String(t.id).trim() : `typ_${idx + 1}`,
    }));
  }

  // Value-only groups (`feature.1.value=`, `verdict_pro.1.value=`, …) describe a
  // simple list, and the editor renders those targets as `type: "list"` — i.e.
  // string[]. Keeping them as `[{ value }]` is what surfaced as "[object Object]".
  flattenValueOnlyGroups(structuredData);

  // Platform/compatibility-aware validation belongs to the parser as well as
  // the save endpoint, so an import preview explains exactly what is missing
  // instead of failing later with a generic save error.
  result.errors.push(...validateGameDevicePerformance(structuredData, { strict: true }));

  result.data = structuredData;
  return result;
}

const VALUE_ONLY_TARGETS = GAME_IMPORT_SCHEMA.filter(
  (f) =>
    f.type === "object" &&
    f.repeatable &&
    f.itemFields &&
    Object.keys(f.itemFields).length === 1 &&
    Boolean(f.itemFields["value"]),
).map((f) => f.target);

function flattenValueOnlyGroups(data: Record<string, any>) {
  for (const target of VALUE_ONLY_TARGETS) {
    const list = data[target];
    if (!Array.isArray(list)) continue;
    data[target] = list
      .map((item: any) => {
        const val = item && typeof item === "object" ? item.value : item;
        return str(val);
      })
      .filter((v: string) => Boolean(v && v.trim()));
  }
}

function findFieldDef(key: string): FieldDef | null {
  const { baseKey, indices } = parseKeyPath(key);
  const searchKey = baseKey.toLowerCase();
  const candidates = GAME_IMPORT_SCHEMA.filter((f) => f.key.toLowerCase() === searchKey);
  if (candidates.length <= 1) return candidates[0] || null;

  // `edition=` (the product's edition label) predates the repeatable
  // `edition.1.*` group. Choose by path shape so both old and new files work.
  return (
    (indices.length
      ? candidates.find((field) => field.repeatable || field.type === "object")
      : candidates.find((field) => !field.repeatable && field.type !== "object")) ||
    candidates[0] ||
    null
  );
}

function parseKeyPath(key: string): { baseKey: string; indices: string[] } {
  const parts = key.split(".");
  const baseKey = parts[0] || "";
  const indices = parts.slice(1);
  return { baseKey, indices };
}

function setValueByPath(
  obj: any,
  baseKey: string,
  indices: string[],
  value: string,
  def: FieldDef,
  result: ParseResult,
) {
  assignField(obj, def, indices, value, baseKey, result);
}

/** Recursively assigns object groups at any depth (`device.N.mode.N.*`). */
function assignField(
  container: Record<string, any>,
  def: FieldDef,
  segments: string[],
  value: string,
  fullKey: string,
  result: ParseResult,
) {
  if (value === "" && !def.required) return;

  if (def.repeatable) {
    if (!Array.isArray(container[def.target])) container[def.target] = [];
    const list = container[def.target] as any[];
    const indexRaw = segments[0];

    if (def.type === "array" && !indexRaw && value.includes(",")) {
      list.push(
        ...value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      return;
    }

    const index = indexRaw ? Number.parseInt(indexRaw, 10) - 1 : list.length;
    if (!Number.isFinite(index) || index < 0) {
      result.errors.push({
        key: fullKey,
        message: `يجب تحديد رقم العنصر (مثلاً ${def.key}.1${def.type === "object" ? ".name" : ""})`,
        severity: "error",
      });
      return;
    }

    if (def.type === "object") {
      const entry = list[index] && typeof list[index] === "object" ? list[index] : {};
      list[index] = entry;
      assignObjectMember(entry, def, segments.slice(1), value, fullKey, result);
      return;
    }

    const typedValue = typed(value, def, fullKey, result);
    if (typedValue !== undefined) list[index] = typedValue;
    return;
  }

  if (def.type === "object") {
    const entry =
      container[def.target] && typeof container[def.target] === "object"
        ? container[def.target]
        : {};
    container[def.target] = entry;
    assignObjectMember(entry, def, segments, value, fullKey, result);
    return;
  }

  if (segments.length) {
    result.unknownFields.push(fullKey);
    return;
  }

  const typedValue = typed(value, def, fullKey, result);
  if (typedValue !== undefined) container[def.target] = typedValue;
}

function assignObjectMember(
  entry: Record<string, any>,
  def: FieldDef,
  segments: string[],
  value: string,
  fullKey: string,
  result: ParseResult,
) {
  const subKey = segments[0];
  const subDef = subKey ? def.itemFields?.[subKey] : undefined;
  if (!subKey) {
    const members = Object.values(def.itemFields || {});
    // Backward-compatible shorthand: `feature.1=text` is equivalent to
    // `feature.1.value=text`; the same applies to one-label nested groups.
    if (members.length === 1 && members[0]) {
      assignField(entry, members[0], [], value, fullKey, result);
      return;
    }
  }
  if (!subDef) {
    result.unknownFields.push(fullKey);
    return;
  }
  assignField(entry, subDef, segments.slice(1), value, fullKey, result);
}

function typed(value: string, def: FieldDef, key: string, result: ParseResult): any {
  let typedValue = convertType(value, def.type);
  if (def.type === "string" || def.type === "multiline") {
    typedValue = getTextValue(typedValue);
  }
  if (typedValue === undefined && value !== "") {
    const isImageField = def.type === "url";
    /*
      A boolean that was filled with prose ("Not Published", "HDR10", a device
      name) is the single most common reason an import used to be refused, and
      "قيمة غير صالحة للنوع boolean" did not say what to write instead. Blank is
      always a valid answer for something nobody published; the descriptive text
      belongs in the matching `*_notes` field.
    */
    const message = isImageField
      ? `تم تجاهل رابط صورة غير صالح: "${value.slice(0, 60)}"`
      : def.type === "boolean"
        ? `قيمة غير صالحة للنوع boolean: "${value.slice(0, 40)}" — المسموح فقط true أو false، أو اترك الحقل فارغاً إذا كانت المعلومة غير معروفة (اكتب التفاصيل في حقل الملاحظات)`
        : `قيمة غير صالحة للنوع ${def.type}`;
    result.errors.push({
      key,
      message,
      severity: isImageField ? "warning" : "error",
    });
    return undefined;
  }

  if (def.validation) {
    const num = Number(typedValue);
    if (def.validation.min !== undefined && num < def.validation.min) {
      result.errors.push({
        key,
        message: `القيمة يجب أن تكون أكبر من أو تساوي ${def.validation.min}`,
        severity: "error",
      });
    }
    if (def.validation.max !== undefined && num > def.validation.max) {
      result.errors.push({
        key,
        message: `القيمة يجب أن تكون أصغر من أو تساوي ${def.validation.max}`,
        severity: "error",
      });
    }
  }
  return typedValue;
}

function convertType(value: string, type: string): any {
  switch (type) {
    case "string":
    case "multiline":
      return value;
    case "number": {
      const clean = value.replace(/[$€£,\s]|IQD|USD|GB|MB/gi, "");
      const n = parseFloat(clean);
      return isNaN(n) ? undefined : n;
    }
    case "integer": {
      const clean = value.replace(/[$€£,\s]|IQD|USD/gi, "");
      const i = parseInt(clean, 10);
      return isNaN(i) ? undefined : i;
    }
    case "boolean":
      if (value.toLowerCase() === "true" || value === "1" || value === "yes" || value === "نعم")
        return true;
      if (value.toLowerCase() === "false" || value === "0" || value === "no" || value === "لا")
        return false;
      return undefined;
    case "date":
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      return value;
    case "url": {
      /*
        Deliberately permissive about *shape* — feeds legitimately carry
        protocol-relative and bare-domain URLs — but never permissive about the
        values that mean "something upstream broke": `[object Object]` from a
        stringified nested value, the literal `undefined`/`null` from template
        interpolation, and whitespace-only cells. Those used to be stored
        verbatim and rendered as a broken image on every surface.
      */
      if (/^https?:\/\/.+/i.test(value) || value.startsWith("/")) return value;
      if (value.startsWith("data:image/")) return value;
      if (!validateImageUrlShape(value).ok) {
        // Accept a bare `cdn.example.com/art.png`, reject the rest.
        if (/^[\w.-]+\.[a-z]{2,}\/\S+$/i.test(value)) return value;
        return undefined;
      }
      return value;
    }
    case "array":
      return value; // Handled by setValueByPath
    default:
      return value;
  }
}
