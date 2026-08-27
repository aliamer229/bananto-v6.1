// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The product hero's product slot.
 *
 * Two production faults are pinned here, because both were invisible to the
 * build, the types and the existing tests:
 *
 * 1. A **grey untextured case**, caused by revealing the WebGL layer on a fixed
 *    600ms timer and by treating "the glTF resolved" as "there is artwork on
 *    it".
 * 2. A **fabricated wrap**, caused by composing a spine and a back out of the
 *    front box cover when no real 3D Texture Source existed.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const STAGE = read("src/hub/gamehub/CaseStage.tsx");
const WEBGL = read("src/hub/gamehub/CaseStageWebGL.tsx");
const BOX = read("src/SwitchBox3D.tsx");
const HERO = read("src/hub/gamehub/Hero.tsx");

describe("3D is shown only for a real 3D Texture Source", () => {
  it("gates the whole WebGL branch on a wrap URL", () => {
    expect(STAGE).toMatch(/const show3D = Boolean\(wrapUrl\)/);
    // The gate must also cover WebGL support, reduced motion and failure.
    const gate = STAGE.slice(STAGE.indexOf("const show3D"), STAGE.indexOf("const show3D") + 160);
    expect(gate).toContain("webglReady");
    expect(gate).toContain("!hasError");
    expect(gate).toContain("!isReduced");
  });

  it("builds the wrap URL from the texture source and the sleeve, never the box cover", () => {
    const chain = STAGE.slice(STAGE.indexOf("const wrapUrl"), STAGE.indexOf("const [textured"));
    expect(chain).toContain("coverTextureUrl");
    expect(chain).toContain("sleeve?.url");
    // The front box cover must not be able to become a 3D texture.
    expect(chain).not.toContain("coverUrl");
  });

  it("returns the static cover without mounting anything 3D when there is no wrap", () => {
    const branch = STAGE.slice(STAGE.indexOf("if (!show3D)"));
    expect(branch.slice(0, 400)).toContain("<StaticCover />");
    expect(branch.slice(0, 400)).not.toContain("CaseStageWebGL");
  });

  it("no longer composes a sleeve from front-only art in the storefront path", () => {
    // The capability still exists in SwitchBox3D, but nothing reachable from the
    // product page passes it.
    expect(WEBGL).toContain('textureMode="wrap"');
    expect(WEBGL).not.toContain('"composed"');
    expect(WEBGL).not.toContain("FRONT_BOX_COVER");
  });
});

describe("the case is revealed only once it is wearing artwork", () => {
  it("has no timer revealing the model", () => {
    // The reveal used to be `setTimeout(() => setModelReady(true), 600)` — it
    // fired whether or not anything had loaded. Nothing in this component may
    // schedule the reveal on a clock again.
    const code = STAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("setTimeout");
    expect(code).not.toContain("setModelReady");
  });

  it("reveals on a textured signal, not on the glTF resolving", () => {
    expect(STAGE).toContain("const handleTextured");
    expect(STAGE).toMatch(/textured \? "opacity-100"/);
    expect(WEBGL).toContain("onTextured={onTextured}");
  });

  it("SwitchBox3D reports textured only when the map actually exists", () => {
    expect(BOX).toContain("if (scene && texture) onTextured?.()");
    // …and declares the texture before the effect that reads it.
    expect(BOX.indexOf("const [texture, setTexture]")).toBeLessThan(
      BOX.indexOf("if (scene && texture) onTextured?.()"),
    );
  });

  it("hands the slot back to the static cover when the texture fails", () => {
    expect(WEBGL).toContain("onFailed()");
    expect(STAGE).toContain("onFailed={() => setHasError(true)}");
  });
});

describe("the static cover is a product photo, not a cropped plate", () => {
  it("uses the front box cover at its natural aspect", () => {
    const fn = STAGE.slice(STAGE.indexOf("const StaticCover"), STAGE.indexOf("const show3D"));
    expect(fn).toContain("caseProps.coverUrl");
    expect(fn).toContain("object-contain");
    expect(fn).not.toContain("object-cover");
    // Explicit intrinsic size keeps the hero from reflowing as it loads.
    expect(fn).toContain("width={480}");
    expect(fn).toContain("height={768}");
  });

  it("falls back to a neutral placeholder, never another role's artwork", () => {
    const fn = STAGE.slice(STAGE.indexOf("const StaticCover"), STAGE.indexOf("const show3D"));
    expect(fn).not.toContain("coverTextureUrl");
    expect(fn).not.toContain("nintendoCardImage");
    expect(fn).not.toContain("bannerImage");
  });
});

describe("the hero background is the Cover Image role", () => {
  it("prefers the detail cover and never the front box", () => {
    const chain = HERO.slice(HERO.indexOf("const backdropUrl"), HERO.indexOf("const backdropUrl") + 400);
    expect(chain).toContain("game.detailCoverUrl");
    expect(chain).toContain("bannerUrl");
    expect(chain).toContain("game.keyArtUrl");
    // A tall box photograph stretched across a landscape header is the bug.
    expect(chain).not.toContain("game.coverUrl");
  });

  it("opens on the game's own artwork rather than the first screenshot", () => {
    expect(HERO).toContain("useState<number | null>(null)");
    expect(HERO).toContain("thumbIndex !== null ? images[thumbIndex]?.url : undefined");
  });
});
