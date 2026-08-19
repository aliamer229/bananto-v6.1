/**
 * Turns whatever shape "box contents" arrives in (plain string, array of
 * strings, array of `{name, quantity}` objects, legacy `{value}` groups…)
 * into a single human-readable line.
 *
 * The admin console edits box contents as one text input, so every other shape
 * has to be flattened before it reaches the input — otherwise React renders
 * objects as "[object Object]".
 */

const NAME_KEYS = ["name", "title", "label", "text", "value", "item", "ar", "en"] as const;

function entryToText(entry: unknown): string {
  if (entry === null || entry === undefined) return "";
  if (typeof entry === "string") return entry.trim();
  if (typeof entry === "number" || typeof entry === "boolean") return String(entry);
  if (Array.isArray(entry)) return entry.map(entryToText).filter(Boolean).join(" ");

  const record = entry as Record<string, unknown>;
  let name = "";
  for (const key of NAME_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      name = candidate.trim();
      break;
    }
    if (candidate && typeof candidate === "object") {
      const nested = entryToText(candidate);
      if (nested) {
        name = nested;
        break;
      }
    }
  }

  // Unknown shape: fall back to the first usable primitive so we never print
  // "[object Object]".
  if (!name) {
    const primitive = Object.values(record).find(
      (v) => (typeof v === "string" && v.trim()) || typeof v === "number",
    );
    if (primitive !== undefined) name = String(primitive).trim();
  }
  if (!name) return "";

  const qty = Number(record["quantity"]);
  return Number.isFinite(qty) && qty > 1 ? `${name} ×${qty}` : name;
}

export function boxContentsToText(value: unknown, separator = "، "): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(entryToText).filter(Boolean).join(separator);
  return entryToText(value);
}
