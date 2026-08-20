import { GAME_IMPORT_SCHEMA, FieldDef } from "./gameImportSchema";
import { getTextValue } from "./utils";
import { str } from "./hub";

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
    const line = lines[i]?.trim();
    if (!line || line.startsWith("#")) {
      i++;
      continue;
    }

    // Check for multiline syntax: key<<EOF
    const multilineMatch = line.match(/^([^=]+)<<EOF$/);
    if (multilineMatch) {
      const key = multilineMatch[1]?.trim();
      if (key) {
        let content = "";
        i++;
        while (i < lines.length && lines[i]?.trim() !== "EOF") {
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

  for (const [key, value] of Object.entries(rawPairs)) {
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
  const { baseKey } = parseKeyPath(key);
  return GAME_IMPORT_SCHEMA.find((f) => f.key === baseKey) || null;
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
  if (value === "" && !def.required) return; // Skip empty optional fields

  let typedValue = convertType(value, def.type);

  // If we expect a string but got something else (like an object from repeating logic),
  // ensure we convert it back to string to avoid [object Object]
  if (def.type === "string" || def.type === "multiline") {
    typedValue = getTextValue(typedValue);
  }

  if (typedValue === undefined && value !== "") {
    result.errors.push({
      key: `${baseKey}${indices.length ? "." + indices.join(".") : ""}`,
      message: `قيمة غير صالحة للنوع ${def.type}`,
      severity: "error",
    });
    return;
  }

  // For optional number/integer/date/url, if value is empty, don't set it (unless required)
  if (value === "" && !def.required) return;

  // Validation
  if (def.validation) {
    const num = Number(typedValue);
    if (def.validation.min !== undefined && num < def.validation.min) {
      result.errors.push({
        key: baseKey,
        message: `القيمة يجب أن تكون أكبر من أو تساوي ${def.validation.min}`,
        severity: "error",
      });
    }
    if (def.validation.max !== undefined && num > def.validation.max) {
      result.errors.push({
        key: baseKey,
        message: `القيمة يجب أن تكون أصغر من أو تساوي ${def.validation.max}`,
        severity: "error",
      });
    }
  }

  if (def.type === "array" || (def.repeatable && def.type !== "object")) {
    if (!obj[def.target]) obj[def.target] = [];
    // For simple arrays or repeatable strings, indices[0] is the index
    const indexStr = indices[0];
    const idx = indexStr ? parseInt(indexStr) - 1 : obj[def.target].length;
    if (!isNaN(idx) && idx >= 0) {
      obj[def.target][idx] = typedValue;
    } else {
      obj[def.target].push(typedValue);
    }
  } else if (def.type === "object" && def.repeatable) {
    if (!obj[def.target]) obj[def.target] = [];
    const indexStr = indices[0];
    const objIdx = indexStr ? parseInt(indexStr) - 1 : -1;
    if (objIdx < 0) {
      result.errors.push({
        key: `${def.key}.${indices.join(".")}`,
        message: "يجب تحديد رقم العنصر (مثلاً edition.1.name)",
        severity: "error",
      });
      return;
    }
    if (!obj[def.target][objIdx]) obj[def.target][objIdx] = {};

    const subKey = indices[1];
    if (subKey && def.itemFields && def.itemFields[subKey]) {
      const subDef = def.itemFields[subKey];
      let subTypedValue = convertType(value, subDef.type);

      // Prevention of [object Object] for strings
      if (subDef.type === "string" || subDef.type === "multiline") {
        subTypedValue = getTextValue(subTypedValue);
      }

      if (subDef.repeatable) {
        if (!obj[def.target][objIdx][subDef.target]) obj[def.target][objIdx][subDef.target] = [];
        const subIndexStr = indices[2];
        const subIdx = subIndexStr ? parseInt(subIndexStr) - 1 : -1;
        if (!isNaN(subIdx) && subIdx >= 0) {
          obj[def.target][objIdx][subDef.target][subIdx] = subTypedValue;
        } else {
          obj[def.target][objIdx][subDef.target].push(subTypedValue);
        }
      } else {
        obj[def.target][objIdx][subDef.target] = subTypedValue;
      }
    }
  } else {
    obj[def.target] = typedValue;
  }
}

function convertType(value: string, type: string): any {
  switch (type) {
    case "string":
    case "multiline":
      return value;
    case "number": {
      const n = parseFloat(value);
      return isNaN(n) ? undefined : n;
    }
    case "integer": {
      const i = parseInt(value);
      return isNaN(i) ? undefined : i;
    }
    case "boolean":
      if (value.toLowerCase() === "true" || value === "1") return true;
      if (value.toLowerCase() === "false" || value === "0") return false;
      return undefined;
    case "date":
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      return undefined;
    case "url":
      if (/^https?:\/\/.+/.test(value) || value.startsWith("/")) return value;
      // Soften URL validation as requested to accept more formats
      if (value.includes(".") && !value.includes(" ")) return value;
      return undefined;
    case "array":
      return value; // Handled by setValueByPath
    default:
      return value;
  }
}
