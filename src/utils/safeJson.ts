/**
 * Safely stringifies objects including circular references, BigInts, and edge cases.
 */
export function safeStringify(val: unknown, indent = 2): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      val,
      (_key, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }
        return value;
      },
      indent
    );
  } catch {
    return String(val);
  }
}
