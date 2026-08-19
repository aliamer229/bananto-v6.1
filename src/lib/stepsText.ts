/**
 * Steps ("how to redeem", setup instructions…) arrive from imports as a list, a
 * heredoc blob, or legacy `{ value: "..." }` records. The admin panel edits them
 * as an ordered list, so everything is normalized to a clean string array here
 * and joined back to text for the fields that still store one string.
 */

export function toStepList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  return raw
    .flatMap((entry) => {
      if (entry && typeof entry === "object") {
        const rec = entry as Record<string, unknown>;
        return [String(rec["value"] ?? rec["text"] ?? rec["title"] ?? rec["name"] ?? "")];
      }
      return String(entry ?? "").split(/\r?\n|\s*[>›»]\s*/);
    })
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export function stepsToText(value: unknown): string {
  return toStepList(value).join("\n");
}
