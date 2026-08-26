import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ASSET_BASE_URL,
  NINTENDO_CASE_MODELS,
  NINTENDO_MODEL_R2_PREFIX,
  NINTENDO_MODEL_ROUTE,
  nintendoCaseModelKey,
  nintendoCaseModelR2Url,
  nintendoCaseModelUrl,
  normalizeCasePlatform,
} from "./publicAssets";

/**
 * Pins the model side of the architecture: Cloudflare R2 is the only home for
 * the geometry, the browser never asks for a `.glb` path, and the sleeve canvas
 * matches the model's authored UVs.
 *
 * All three of these were broken at once in August 2026: production had been
 * pointed at a local `/source/SwitchCase.glb` containing a hand-made 6 KB box,
 * after the real R2 object's `.glb` URL was challenged by Cloudflare and the
 * resulting HTML error page was mistaken for a corrupt model.
 */

describe("the canonical model lives in Cloudflare R2", () => {
  it("keeps both platforms' models under the R2 prefix", () => {
    for (const file of Object.values(NINTENDO_CASE_MODELS)) {
      expect(nintendoCaseModelKey(file.includes("2") ? "switch2" : "switch")).toMatch(
        new RegExp(`^${NINTENDO_MODEL_R2_PREFIX}`),
      );
    }
    expect(nintendoCaseModelKey("switch")).toBe("Pages/Glb/SwitchCase.glb");
  });

  it("still addresses the object on the public R2 host for tooling", () => {
    expect(nintendoCaseModelR2Url("switch")).toBe(`${ASSET_BASE_URL}/Pages/Glb/SwitchCase.glb`);
  });
});

describe("the browser never requests a .glb path", () => {
  /*
    A rule on the zone answers any path ending in `.glb` with a Cloudflare
    managed challenge — an HTML page with status 403. GLTFLoader parses that
    HTML, fails on the magic number, and the whole thing reads as a corrupt
    model. Keeping the extension out of the URL is what stops that recurring.
  */
  it("serves the model from a same-origin, extension-less route", () => {
    for (const platform of ["switch", "switch2", "ns", "ns2", "both", undefined]) {
      const url = nintendoCaseModelUrl(platform);
      expect(url.startsWith(NINTENDO_MODEL_ROUTE), `${platform} -> ${url}`).toBe(true);
      expect(url, `${platform} -> ${url}`).not.toMatch(/\.glb(\?|$)/);
      expect(url, `${platform} -> ${url}`).not.toMatch(/^https?:/);
    }
  });

  it("carries a version so a replaced model invalidates only its own cache entry", () => {
    expect(nintendoCaseModelUrl("switch")).toMatch(/\?v=\d+$/);
  });
});

describe("platform decides the geometry", () => {
  it("maps every spelling the catalogue uses", () => {
    expect(normalizeCasePlatform("switch2")).toBe("switch2");
    expect(normalizeCasePlatform("Switch 2")).toBe("switch2");
    expect(normalizeCasePlatform("switch-2")).toBe("switch2");
    expect(normalizeCasePlatform("ns2")).toBe("switch2");
    expect(normalizeCasePlatform("switch")).toBe("switch");
    expect(normalizeCasePlatform("ns")).toBe("switch");
  });

  it("does not infer Switch 2 from backward compatibility", () => {
    // "both" means the game runs on either console, not that the disc in the
    // customer's hand is a Switch 2 edition.
    expect(normalizeCasePlatform("both")).toBe("switch");
    expect(normalizeCasePlatform(undefined)).toBe("switch");
    expect(normalizeCasePlatform("")).toBe("switch");
    expect(normalizeCasePlatform("playstation")).toBe("switch");
  });

  it("registers a model for each platform so a future Switch 2 body is one line", () => {
    expect(Object.keys(NINTENDO_CASE_MODELS).sort()).toEqual(["switch", "switch2"]);
    for (const file of Object.values(NINTENDO_CASE_MODELS)) {
      expect(file).toMatch(/\.glb$/);
    }
  });
});

describe("geometry is reusable, artwork is not baked into it", () => {
  const SOURCE = readFileSync(join(import.meta.dirname, "..", "SwitchBox3D.tsx"), "utf8");

  it("asks the config for the model rather than hardcoding a path", () => {
    expect(SOURCE).toMatch(/nintendoCaseModelUrl\(platform\)/);
    // No local copy, and nothing in /public or /src/assets.
    expect(SOURCE).not.toMatch(/["']\/source\/SwitchCase\.glb["']/);
    expect(SOURCE).not.toMatch(/["']\/models\/SwitchCase\.glb["']/);
    expect(SOURCE).not.toMatch(/["']\/assets\/[^"']*\.glb["']/);
  });

  it("does not preload the model at module scope", () => {
    // A module-scope preload put 200 KB on the wire during the storefront's
    // first paint, on every page, for a viewer only the product page shows.
    const uncommented = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(uncommented).not.toMatch(/useGLTF\.preload\(/);
  });

  it("composites the sleeve to the model's authored UV layout", () => {
    // Back 588 + spine 60 + front 588 = 1236, which is where the model's UV
    // seams fall (0.473 and 0.526). Change one and the other must follow.
    const width = /width:\s*(\d+)/.exec(SOURCE);
    const back = /backWidth:\s*(\d+)/.exec(SOURCE);
    const spine = /spineWidth:\s*(\d+)/.exec(SOURCE);
    const front = /frontWidth:\s*(\d+)/.exec(SOURCE);
    expect(width && back && spine && front).toBeTruthy();

    const total = Number(back![1]) + Number(spine![1]) + Number(front![1]);
    expect(total).toBe(Number(width![1]));

    const backEnd = Number(back![1]) / total;
    const spineEnd = (Number(back![1]) + Number(spine![1])) / total;
    expect(backEnd).toBeCloseTo(0.4733, 2);
    expect(spineEnd).toBeCloseTo(0.5255, 2);
  });

  it("uploads the texture the way the model's V axis expects", () => {
    // The sleeve's V runs top-to-bottom, which is image order, so the texture
    // must not be flipped.
    expect(SOURCE).toMatch(/flipY\s*=\s*false/);
  });

  it("keeps the shell tint as the only Switch-2 difference", () => {
    // Both platforms share one geometry; the livery is a material property.
    expect(NINTENDO_CASE_MODELS.switch).toBe(NINTENDO_CASE_MODELS.switch2);
    expect(SOURCE).toMatch(/materials\.plastic\.color\.set\(/);
  });
});
