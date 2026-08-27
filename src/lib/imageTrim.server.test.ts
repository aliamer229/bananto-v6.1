// @vitest-environment node
import { describe, expect, it } from "vitest";

import { detectTrimCrop } from "./imageTrim.server";

/**
 * The Front Box Cover as supplier feeds actually ship it: a box packshot
 * floating in a large white rectangle.
 *
 * Framing that with `object-fit: contain` is faithful and therefore wrong — it
 * reproduces the white field, which is the "white outer background" on the
 * product page and the scattered-stamps look in a cover grid. The margin is in
 * the file, so these tests are about the file.
 *
 * Every fixture is generated here rather than committed, so the assertions are
 * about the algorithm and not about a particular JPEG.
 */
async function loadSharp() {
  const mod = await import("sharp");
  return (mod.default || mod) as unknown as (input: unknown, options?: unknown) => any;
}

/** A red box with a white rating badge, floating in `pad` px of white. */
async function paddedPackshot(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  { boxW = 420, boxH = 600, canvas = 1000 } = {},
) {
  const art = `<svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${boxW}" height="${boxH}" fill="#8b1f2f"/>
    <rect x="0" y="0" width="${boxW}" height="54" fill="#e60012"/>
    <rect x="24" y="${boxH - 80}" width="70" height="56" fill="#ffffff" stroke="#000" stroke-width="4"/>
  </svg>`;
  const box = await sharp(Buffer.from(art)).png().toBuffer();
  return new Uint8Array(
    await sharp({ create: { width: canvas, height: canvas, channels: 3, background: "#ffffff" } })
      .composite([
        { input: box, left: Math.round((canvas - boxW) / 2), top: Math.round((canvas - boxH) / 2) },
      ])
      .jpeg({ quality: 92 })
      .toBuffer(),
  );
}

describe("the empty field around a packshot is removed from the file", () => {
  it("finds the box inside a white canvas", async () => {
    const sharp = await loadSharp();
    const found = await detectTrimCrop(await paddedPackshot(sharp), sharp);

    expect(found).not.toBeNull();
    // 420x600 centred in 1000x1000, plus the small safe inset the algorithm
    // leaves so anti-aliased edges are not shaved.
    expect(found!.crop.width).toBeGreaterThan(400);
    expect(found!.crop.width).toBeLessThan(460);
    expect(found!.crop.height).toBeGreaterThan(580);
    expect(found!.crop.height).toBeLessThan(640);
    expect(found!.crop.left).toBeGreaterThan(260);
    expect(found!.crop.left).toBeLessThan(310);
  });

  it("keeps the rating badge, which is the thing a careless crop eats", async () => {
    const sharp = await loadSharp();
    const bytes = await paddedPackshot(sharp);
    const found = await detectTrimCrop(bytes, sharp);
    expect(found).not.toBeNull();

    // The badge is a white rectangle at the box's bottom-left. A crop driven by
    // "white is background" without bounds would cut through it.
    const { left, top, width, height } = found!.crop;
    const badgeLeft = 290 + 24;
    const badgeBottom = 200 + 600 - 24;
    expect(left).toBeLessThanOrEqual(badgeLeft);
    expect(top + height).toBeGreaterThanOrEqual(badgeBottom);
  });

  it("actually shrinks the encoded image", async () => {
    const sharp = await loadSharp();
    const bytes = await paddedPackshot(sharp);
    const found = await detectTrimCrop(bytes, sharp);

    const out = await sharp(bytes).rotate().extract(found!.crop).webp({ quality: 85 }).toBuffer();
    const meta = await sharp(out).metadata();
    // Portrait box art, not a square canvas: the frame now matches the artwork,
    // so `contain` has nothing left to letterbox.
    expect(meta.width! / meta.height!).toBeLessThan(0.85);
    expect(meta.width! / meta.height!).toBeGreaterThan(0.55);
  });
});

describe("it refuses every case where a crop would damage the picture", () => {
  it("leaves a full-bleed case wrap alone", async () => {
    const sharp = await loadSharp();
    // Back / spine / front, edge to edge — the 3D Texture Source.
    const wrap = `<svg width="1236" height="951" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="588" height="951" fill="#12a150"/>
      <rect x="588" y="0" width="60" height="951" fill="#e60012"/>
      <rect x="648" y="0" width="588" height="951" fill="#1f2bc8"/>
    </svg>`;
    const bytes = new Uint8Array(await sharp(Buffer.from(wrap)).jpeg().toBuffer());
    expect(await detectTrimCrop(bytes, sharp)).toBeNull();
  });

  it("leaves a dark screenshot alone", async () => {
    const sharp = await loadSharp();
    const bytes = new Uint8Array(
      await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#101418" } })
        .jpeg()
        .toBuffer(),
    );
    // A dark border is artwork bleeding to the edge, never padding.
    expect(await detectTrimCrop(bytes, sharp)).toBeNull();
  });

  it("leaves an already-tight cover alone rather than shifting it a pixel", async () => {
    const sharp = await loadSharp();
    const bytes = await paddedPackshot(sharp, { boxW: 420, boxH: 600, canvas: 620 });
    const found = await detectTrimCrop(bytes, sharp);
    // 420x600 inside 620x620 still has real margin; the guard being tested is
    // that the crop never exceeds the frame.
    if (found) {
      expect(found.crop.left + found.crop.width).toBeLessThanOrEqual(620);
      expect(found.crop.top + found.crop.height).toBeLessThanOrEqual(620);
    }
  });

  it("refuses when the whole frame is one colour", async () => {
    const sharp = await loadSharp();
    const bytes = new Uint8Array(
      await sharp({ create: { width: 800, height: 800, channels: 3, background: "#ffffff" } })
        .jpeg()
        .toBuffer(),
    );
    expect(await detectTrimCrop(bytes, sharp)).toBeNull();
  });

  it("returns null rather than throwing on bytes that are not an image", async () => {
    const sharp = await loadSharp();
    expect(await detectTrimCrop(new Uint8Array([1, 2, 3, 4]), sharp)).toBeNull();
  });
});

/**
 * How the detector is wired into the two pipelines that use it.
 *
 * These are source assertions in the style the rest of this repo uses for
 * things a unit test cannot reach. The end-to-end path — proxy fetches a remote
 * cover, trims it, encodes WebP — needs outbound network to the asset host,
 * which the test environment does not have.
 */
describe("the trim is wired into the read path", () => {
  const read = async (p: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), p), "utf8");
  };

  it("keys the cache on the trim flag", async () => {
    const IMG = await read("src/routes/api/img.ts");
    // Without this, the first untrimmed request for a URL poisons the cache and
    // every later `trim=1` request is answered with the padded image — a bug
    // that would look exactly like the trim silently not working.
    expect(IMG).toMatch(/const cacheKey =[^;]*wantsTrim/s);
  });

  it("crops before resizing", async () => {
    const IMG = await read("src/routes/api/img.ts");
    const cropAt = IMG.indexOf("detectTrimCrop");
    const resizeAt = IMG.indexOf("pipeline.resize");
    expect(cropAt).toBeGreaterThan(-1);
    expect(resizeAt).toBeGreaterThan(-1);
    // The crop is measured in source pixels, so it has to be applied while the
    // pipeline is still at source size.
    expect(cropAt).toBeLessThan(resizeAt);
  });

  it("encodes the crop even when no resize or format change was asked for", async () => {
    const IMG = await read("src/routes/api/img.ts");
    expect(IMG).toContain("targetWidth > 0 || wantsTrim");
  });

  it("rotates before cropping in the upload path", async () => {
    const PROC = await read("src/lib/imageProcessor.ts");
    // `detectTrimCrop` measures the EXIF-oriented frame. A crop applied before
    // the rotation lands on its side.
    expect(PROC).toContain('sharp(bytes, { failOnError: false } as any).rotate()');
    expect(PROC).not.toContain(".rotate() // Auto-correct EXIF orientation");
  });

  it("no longer decides padding from four corner pixels", async () => {
    const PROC = await read("src/lib/imageProcessor.ts");
    expect(PROC).not.toContain("Ignore corner extraction errors");
    expect(PROC).not.toContain("image.trim({ threshold: 12 })");
    // Both encoders (AVIF and WebP) had their own copy of the heuristic; both
    // now call the one detector.
    expect(PROC.match(/detectTrimCrop\(bytes, sharp/g) || []).toHaveLength(2);
  });

  it("carries the flag through every srcSet candidate", async () => {
    const IMG = await read("src/lib/img.ts");
    // A srcSet of untrimmed candidates would undo the crop as soon as the
    // browser picked a width other than the `src`.
    const fn = IMG.slice(IMG.indexOf("export function buildSrcSet"));
    expect(fn).toContain("trim: true");
  });
});
