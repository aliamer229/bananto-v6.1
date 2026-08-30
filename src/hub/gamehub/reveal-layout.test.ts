import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const revealHook = readFileSync("src/hub/hooks/useReveal.ts", "utf8");
const styles = readFileSync("src/styles.css", "utf8");
const bits = readFileSync("src/hub/ui/Bits.tsx", "utf8");
const section = readFileSync("src/hub/ui/Section.tsx", "utf8");
const gameHub = readFileSync("src/hub/gamehub/GameHub.tsx", "utf8");

describe("game detail reveal layout", () => {
  it("never hides game-detail content while preserving its layout height", () => {
    expect(styles).toMatch(/\[data-reveal\]\s*\{[\s\S]*?opacity:\s*1;/);
    expect(styles).not.toContain('html[data-reveal-ready="true"] [data-reveal="hidden"]');
    expect(bits).toContain('data-reveal="shown"');
    expect(section).toContain('data-reveal="shown"');
  });

  it("does not arm IntersectionObserver for game sections", () => {
    expect(gameHub).not.toContain("useReveal(");
    expect(revealHook).toContain("IntersectionObserver");
  });
});
