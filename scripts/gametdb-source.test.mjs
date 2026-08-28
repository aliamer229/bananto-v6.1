import { describe, expect, it } from "vitest";

import { FRONT_PANEL, gameTdbId, REGION_PRIORITY, wrapUrl } from "./lib/gametdb-source.mjs";

describe("gameTdbId", () => {
  it("takes the id out of Nintendo's product code", () => {
    expect(gameTdbId("HACPAAAAA")).toBe("AAAAA");
    expect(gameTdbId("HACPAMPYA")).toBe("AMPYA");
    expect(gameTdbId("hacpaaaaa")).toBe("AAAAA");
  });

  it("returns nothing rather than a guess when the code is not one", () => {
    for (const bad of ["", null, undefined, "7100005308", "SOMETHING-ELSE"]) {
      expect(gameTdbId(bad)).toBe("");
    }
  });
});

describe("wrapUrl", () => {
  it("asks for the high-resolution sleeve, never the thumbnail", () => {
    expect(wrapUrl("AAAAA", "JA")).toBe("https://art.gametdb.com/switch/coverfullHQ/JA/AAAAA.jpg");
  });

  it("covers the regions this shop sells accounts for", () => {
    expect(REGION_PRIORITY).toContain("JA");
    expect(REGION_PRIORITY).toContain("ZH");
  });
});

describe("FRONT_PANEL", () => {
  it("matches the sleeve's own three-panel geometry", () => {
    // 588 back + 60 spine + 588 front = 1236
    expect(FRONT_PANEL.start).toBeCloseTo(648 / 1236, 6);
    expect(FRONT_PANEL.width).toBeCloseTo(588 / 1236, 6);
    expect(FRONT_PANEL.start + FRONT_PANEL.width).toBeCloseTo(1, 6);
  });

  it("yields a portrait panel from a 1.3-aspect wrap", () => {
    const w = 2454;
    const h = 1888;
    const panel = Math.round(w * FRONT_PANEL.width);
    expect(panel / h).toBeLessThan(0.87);
  });
});
