type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | undefined | null>;

/** Minimal class-name joiner — no dependency, no tailwind-merge magic. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, enabled] of Object.entries(value)) if (enabled) out.push(key);
  };
  values.forEach(walk);
  return out.join(" ");
}
