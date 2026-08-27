import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The 3D case renders stacked meshes: a solid inner core, the printed sleeve (the artwork),
 * a clear plastic shell in front of it, and a foil protective finish.
 *
 * These assertions pin the key properties that decide whether the artwork is crisp, solid,
 * and perfectly visible without occlusions or milky overlays.
 */
const SOURCE = readFileSync(join(import.meta.dirname, "SwitchBox3D.tsx"), "utf8");

describe("SwitchBox3D sleeve visibility and solid structure", () => {
  it("keeps the plastic shell transparent enough to read the artwork through", () => {
    const match =
      /opacity:\s*(?:platform === "ns2"|isSwitch2)\s*\?\s*([\d.]+)\s*:\s*([\d.]+)/.exec(SOURCE);
    expect(match).toBeTruthy();
    const [ns2, ns1] = [Number(match![1]), Number(match![2])];
    expect(ns2).toBeLessThanOrEqual(0.4);
    expect(ns1).toBeLessThanOrEqual(0.25);
  });

  it("never lets transparent outer shell materials write depth", () => {
    expect(SOURCE).toMatch(/depthWrite:\s*false/);
  });

  it("ensures the printed sleeve is solid and non-transparent", () => {
    expect(SOURCE).toMatch(/transparent=\{false\}/);
    expect(SOURCE).toMatch(/opacity=\{1\}/);
    expect(SOURCE).toMatch(/depthWrite=\{true\}/);
    expect(SOURCE).toMatch(/depthTest=\{true\}/);
  });

  it("draws nothing at all while the artwork is still compositing", () => {
    /*
      This used to be "do not tint the sleeve toward white while the artwork is
      still drawing" — pick a dark placeholder colour so the waiting state is
      less obtrusive. That framing conceded the wrong thing: it accepted that an
      empty case gets drawn and argued about its shade. Under this scene's
      ambient plus two directional lights, the dark tint still resolved to a
      lit grey, which is what customers were reporting.

      The case is simply not drawn until it is wearing artwork, so the sleeve
      colour is a plain white base for the map to multiply against and there is
      no waiting state on screen to tint.
    */
    expect(SOURCE).toContain("visible={Boolean(texture)}");
    expect(SOURCE).toMatch(/color="#ffffff"/);
    expect(SOURCE).not.toMatch(/color=\{texture \?/);
  });

  it("forces the shader recompile that makes the map take effect", () => {
    // Assigning `.map` to an already-compiled material does not add the texture
    // fetch to its shader. See `applySleeveTexture`.
    expect(SOURCE).toContain("applySleeveTexture(sleeveMaterialRef.current, texture)");
    const sleeve = SOURCE.slice(SOURCE.indexOf("<meshStandardMaterial"));
    expect(sleeve.slice(0, 400)).not.toContain("map=");
  });

  it("asks for CORS only on genuinely cross-origin artwork", () => {
    expect(SOURCE).toMatch(/new URL\(coverImage\)\.origin !== window\.location\.origin/);
  });

  it("hands the slot back to the static cover when the artwork fails to decode", () => {
    // There is no "branded sleeve" fallback any more. Composing a blank retail
    // case out of a brand colour and a game title and uploading it as a texture
    // is what produced a grey box on a 404; the stage shows the real Front Box
    // Cover photograph instead.
    expect(SOURCE).toMatch(/artworkDrawn\s*=\s*true/);
    expect(SOURCE).toMatch(/if \(!artworkDrawn\)/);
    const branch = SOURCE.slice(SOURCE.indexOf("if (!artworkDrawn)"), SOURCE.indexOf("if (!artworkDrawn)") + 300);
    expect(branch).toContain("onTextureError");
    expect(branch).toContain("return;");
  });
});

