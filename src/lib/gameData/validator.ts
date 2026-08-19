import { GAME_SCHEMA, type Schema, type FieldDef } from "./schema";
import { type ParsedValue } from "./parser";

export interface ValidationError {
  section: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data: Record<string, any>;
}

export function validateGameData(
  parsedData: Record<string, Record<string, ParsedValue>>,
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], data: {} };
  const schema = GAME_SCHEMA;

  // 1. Check for schema version
  const importSection = parsedData["IMPORT"];
  if (!importSection || importSection["schema_version"] !== 1) {
    result.errors.push({
      section: "IMPORT",
      field: "schema_version",
      message: "Unsupported or missing schema version. Expected 1.",
      severity: "error",
    });
    result.valid = false;
  }

  // 2. Iterate through schema and validate presence/types
  for (const sectionName in schema.sections) {
    const sectionSchema = schema.sections[sectionName];
    if (!sectionSchema) continue;

    const sectionData = parsedData[sectionName] || {};
    const validatedSection: Record<string, any> = {};

    for (const fieldName in sectionSchema) {
      if (fieldName === "*") continue;

      const fieldDef = sectionSchema[fieldName];
      if (!fieldDef) continue;

      const rawValue = sectionData[fieldName];

      if (fieldDef.required && (rawValue === undefined || rawValue === null)) {
        result.errors.push({
          section: sectionName,
          field: fieldName,
          message: `Field "${fieldName}" is required in section [${sectionName}].`,
          severity: "error",
        });
        result.valid = false;
        continue;
      }

      if (rawValue !== undefined) {
        const validatedValue = validateField(sectionName, fieldName, fieldDef, rawValue, result);
        if (validatedValue !== undefined) {
          validatedSection[fieldName] = validatedValue;
        }
      } else {
        validatedSection[fieldName] = fieldDef.type === "array" ? [] : null;
      }
    }

    const dynamicDef = sectionSchema["*"];
    if (dynamicDef) {
      const processedDynamic = processDynamicKeys(sectionName, dynamicDef, sectionData, result);
      if (dynamicDef.type === "object") {
        validatedSection["items"] = processedDynamic;
      } else if (
        sectionName === "GENRES" ||
        sectionName === "TYPES" ||
        sectionName === "FEATURES"
      ) {
        validatedSection["list"] = processedDynamic;
      }
    }

    result.data[sectionName] = validatedSection;
  }

  // 3. Unknown checks
  for (const sectionName in parsedData) {
    const sectionSchema = schema.sections[sectionName];
    if (!sectionSchema) {
      result.errors.push({
        section: sectionName,
        message: `Unknown section [${sectionName}].`,
        severity: "error",
      });
      result.valid = false;
    } else {
      const sectionData = parsedData[sectionName];
      if (!sectionData) continue;
      for (const fieldName in sectionData) {
        if (!sectionSchema[fieldName] && !isDynamicKey(fieldName, sectionSchema)) {
          result.errors.push({
            section: sectionName,
            field: fieldName,
            message: `Unknown field "${fieldName}" in section [${sectionName}].`,
            severity: "error",
          });
          result.valid = false;
        }
      }
    }
  }

  return result;
}

function validateField(
  section: string,
  field: string,
  def: FieldDef,
  value: ParsedValue,
  result: ValidationResult,
): any {
  if (value === null) return null;

  switch (def.type) {
    case "string":
      if (typeof value !== "string") {
        addError(result, section, field, "Expected a string.");
        return undefined;
      }
      return value;

    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (isNaN(num)) {
        addError(result, section, field, "Expected a number.");
        return undefined;
      }
      if (def.min !== undefined && num < def.min) {
        addError(result, section, field, `Value must be at least ${def.min}.`);
        return undefined;
      }
      if (def.max !== undefined && num > def.max) {
        addError(result, section, field, `Value must be at most ${def.max}.`);
        return undefined;
      }
      return num;
    }

    case "boolean":
      if (typeof value !== "boolean") {
        addError(result, section, field, "Expected a boolean (true/false).");
        return undefined;
      }
      return value;

    case "date":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        addError(result, section, field, "Expected a date in YYYY-MM-DD format.");
        return undefined;
      }
      return value;

    case "url":
      if (typeof value !== "string" || !/^https?:\/\/.+/.test(value)) {
        addError(result, section, field, "Expected a valid URL starting with http:// or https://.");
        return undefined;
      }
      return value;

    default:
      return value;
  }
}

function addError(result: ValidationResult, section: string, field: string, message: string) {
  result.errors.push({ section, field, message, severity: "error" });
  result.valid = false;
}

function isDynamicKey(key: string, sectionSchema: Record<string, FieldDef>): boolean {
  if (!sectionSchema["*"]) return false;
  return /^\d+(\..+)?$/.test(key);
}

function processDynamicKeys(
  section: string,
  def: FieldDef,
  data: Record<string, ParsedValue>,
  result: ValidationResult,
): any[] {
  const items: Record<string, any> = {};

  for (const key in data) {
    const match = key.match(/^(\d+)(?:\.(.+))?$/);
    if (!match) continue;

    const index = match[1];
    const subKey = match[2];
    const val = data[key];
    if (val === undefined || index === undefined) continue;

    if (def.type === "object" && def.itemFields) {
      if (!items[index]) items[index] = {};
      const currentItem = items[index];
      if (subKey && currentItem) {
        const fieldDef = def.itemFields[subKey] || findNestedFieldDef(subKey, def.itemFields);
        if (fieldDef) {
          const validated = validateField(section, `${index}.${subKey}`, fieldDef, val, result);
          if (validated !== undefined) {
            currentItem[subKey] = validated;
          }
        } else {
          addError(result, section, key, `Unknown sub-field "${subKey}".`);
        }
      }
    } else {
      items[index] = validateField(section, key, def, val, result);
    }
  }

  const sortedKeys = Object.keys(items).sort((a, b) => Number(a) - Number(b));
  return sortedKeys.map((k) => items[k]);
}

function findNestedFieldDef(
  subKey: string,
  itemFields: Record<string, FieldDef>,
): FieldDef | undefined {
  if (subKey.includes(".")) {
    const parts = subKey.split(".");
    const baseKey = parts[0];
    if (baseKey) {
      const baseDef = itemFields[baseKey];
      if (baseDef && baseDef.type === "array") {
        return { type: "string" };
      }
    }
  }
  return itemFields[subKey];
}
