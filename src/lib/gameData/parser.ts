export type ParsedValue = string | number | boolean | null | ParsedArray | ParsedObject;
export type ParsedArray = ParsedValue[];
export type ParsedObject = { [key: string]: ParsedValue };

export interface ParseResult {
  data: Record<string, Record<string, ParsedValue>>;
  errors: string[];
  warnings: string[];
}

export function parseGameData(rawText: string): ParseResult {
  const result: ParseResult = { data: {}, errors: [], warnings: [] };
  const lines = rawText.split("\n");
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1);
      if (!result.data[currentSection]) {
        result.data[currentSection] = {};
      }
      continue;
    }

    if (currentSection && trimmed.includes("=")) {
      const eqIndex = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();

      const section = result.data[currentSection];
      if (key && section) {
        section[key] = parseValue(value);
      }
    }
  }

  return result;
}

function parseValue(value: string): ParsedValue {
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "null") return null;
  if (!isNaN(Number(value)) && value !== "") return Number(value);
  return value;
}
