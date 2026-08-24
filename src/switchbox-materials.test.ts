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

  it("does not tint the sleeve toward white while the artwork is still drawing", () => {
    expect(SOURCE).not.toMatch(/color=\{texture \? "#ffffff" : "#eeeeee"\}/);
    expect(SOURCE).toMatch(/color=\{texture \? "#ffffff" : "#[0-9a-f]{6}"\}/i);
  });

  it("asks for CORS only on genuinely cross-origin artwork", () => {
    expect(SOURCE).toMatch(/new URL\(coverImage\)\.origin !== window\.location\.origin/);
  });

  it("falls back to the branded sleeve when the artwork fails to decode", () => {
    expect(SOURCE).toMatch(/artworkDrawn\s*=\s*true/);
    expect(SOURCE).toMatch(/if \(!artworkDrawn\)/);
  });
});

