import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("game detail mobile width contract", () => {
  it("lets every top-level game-hub grid and rail shrink to the viewport", () => {
    const route = readFileSync("src/routes/product.$productId.tsx", "utf8");
    const hub = readFileSync("src/hub/gamehub/GameHub.tsx", "utf8");
    const hero = readFileSync("src/hub/gamehub/Hero.tsx", "utf8");
    const chrome = readFileSync("src/hub/gamehub/Chrome.tsx", "utf8");

    expect(route).toContain("min-h-screen w-full min-w-0 max-w-full");
    expect(hub).toContain('<article className="w-full min-w-0 max-w-full">');
    expect(hero).toContain("grid min-w-0 grid-cols-1");
    expect(chrome).toContain("w-full min-w-0 max-w-full border-b");
  });

  it("keeps a real product page in the phone overflow sweep", () => {
    const sweep = readFileSync("scripts/check-horizontal-overflow.mjs", "utf8");
    expect(sweep).toContain('"/product/prd_5ba181a080d14238"');
  });
});
