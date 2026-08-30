import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const STYLES = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Bananto visual identity baseline", () => {
  it("loads the original scoped design system instead of the generic redesign", () => {
    expect(STYLES).toContain('@import "tailwindcss" source(none);');
    expect(STYLES).toContain('@source "../src";');
    expect(STYLES).not.toContain('@import "./index.css";');
  });

  it("keeps the original cream storefront surfaces and light borders", () => {
    expect(STYLES).toContain("--page: #f4f1e8;");
    expect(STYLES).toContain("--surface: #f8f5f1;");
    expect(STYLES).toContain("--surface-2: #fcfbf9;");
    expect(STYLES).toContain("--line: #d6cdc2;");
    expect(STYLES).toContain("--radius: 0.625rem;");
  });

  it("keeps cartridges independent from generic card and theme tokens", () => {
    expect(STYLES).toContain("--cart-red: #e60012;");
    expect(STYLES).toContain("--cart-shell: #1c1c1c;");
    expect(STYLES).toContain("--cart-shell-2: #1a1a1a;");
  });

  it("preserves optional themes without changing the original default pack", () => {
    for (const theme of ["cream", "midnight", "space", "banana", "cyber"]) {
      expect(STYLES).toContain(`[data-theme="${theme}"]`);
    }
  });
});
