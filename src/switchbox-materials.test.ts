import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The 3D case renders three stacked meshes: the printed sleeve (the artwork),
 * a plastic shell in front of it, and a foil sleeve in front of that. The
 * artwork was reported as hidden behind a black or white layer.
 *
 * The GLB itself lives on the production CDN, so the WebGL path cannot be
 * rendered here. These assertions pin the three properties that decide whether
 * the artwork is visible at all, so the regression cannot come back silently.
 */
const SOURCE = readFileSync(join(import.meta.dirname, "SwitchBox3D.tsx"), "utf8");

describe("SwitchBox3D sleeve visibility", () => {
  it("keeps the plastic shell transparent enough to read the artwork through", () => {
    const match =
      /materials\.plastic\.opacity\s*=\s*platform === "ns2" \? ([\d.]+) : ([\d.]+)/.exec(SOURCE);
    expect(match).toBeTruthy();
    const [ns2, ns1] = [Number(match![1]), Number(match![2])];
    // At the previous 0.85 / 0.78 the shell was effectively a coat of paint
    // over the sleeve.
    expect(ns2).toBeLessThanOrEqual(0.4);
    expect(ns1).toBeLessThanOrEqual(0.25);
  });

  it("never lets a transparent material write depth", () => {
    // A transparent shell that writes depth occludes both the sleeve behind it
    // and its own far faces, which reads as flat opaque patches.
    expect(SOURCE).toMatch(/materials\.plastic\.depthWrite\s*=\s*false/);
    expect(SOURCE).toMatch(/materials\.foil\.depthWrite\s*=\s*false/);
  });

  it("does not tint the sleeve toward white while the artwork is still drawing", () => {
    // The map is multiplied by the tint, so a near-white tint with no map is
    // indistinguishable from a blank case.
    expect(SOURCE).not.toMatch(/color=\{texture \? "#ffffff" : "#eeeeee"\}/);
    expect(SOURCE).toMatch(/color=\{texture \? "#ffffff" : "#[0-9a-f]{6}"\}/i);
  });

  it("asks for CORS only on genuinely cross-origin artwork", () => {
    // cdnImage() proxies remote art through the same-origin /api/img, and a
    // needless CORS request there can only fail the load.
    expect(SOURCE).toMatch(/new URL\(coverImage\)\.origin !== window\.location\.origin/);
  });

  it("falls back to the branded sleeve when the artwork fails to decode", () => {
    expect(SOURCE).toMatch(/artworkDrawn\s*=\s*true/);
    expect(SOURCE).toMatch(/if \(!artworkDrawn\)/);
  });
});
