import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const revealHook = readFileSync("src/hub/hooks/useReveal.ts", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("game detail reveal layout", () => {
  it("keeps server-rendered sections visible until the observer is ready", () => {
    expect(styles).toMatch(/\[data-reveal\]\s*\{[\s\S]*?opacity:\s*1;/);
    expect(styles).toContain('html[data-reveal-ready="true"] [data-reveal="hidden"]');
  });

  it("shows elements already above or inside a restored viewport", () => {
    expect(revealHook).toContain("el.getBoundingClientRect()");
    expect(revealHook).toContain("rect.bottom <= 0 || rect.top <= window.innerHeight * 0.92");
    expect(revealHook).toContain('dataset["revealReady"] = "true"');
  });
});
