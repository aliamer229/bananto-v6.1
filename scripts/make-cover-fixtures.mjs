#!/usr/bin/env node
/**
 * Generates the cover fixtures used to verify `src/lib/imageTrim.ts` in a real
 * browser, against a real decode, on real pages.
 *
 * Unit tests cover the algorithm on synthetic pixel buffers. These are the
 * other half: actual PNG files with actual margins, so the whole path — decode,
 * downsample, `getImageData`, crop, CSS framing — can be checked end to end at
 * `/dev-fixtures/*` with a seeded catalogue. They are generated rather than
 * committed so the repository does not carry a couple of megabytes of test
 * artwork.
 *
 *   node scripts/make-cover-fixtures.mjs [outDir]
 *
 * Default outDir is `public/dev-fixtures`, which is git-ignored.
 *
 * The set deliberately spans every branch the trim has to get right:
 *   cover-white-margin        box adrift in pure white   → crop  (reference 01)
 *   cover-offwhite-margin     off-white JPEG-ish + noise → crop
 *   cover-transparent-margin  transparent padding        → crop, via alpha
 *   cover-tight               already tight              → no crop (reference 02)
 *   cover-hires               tight, print resolution    → no crop, 3D texture
 *   banner-wide               landscape key art          → no crop, never a cover
 *   square-card               square card artwork        → no crop
 *   blank                     near-empty plate           → no crop, fails QA
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "public/dev-fixtures";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Writes a truecolour-with-alpha PNG. `paint(x, y)` returns `[r, g, b, a?]`. */
function writePNG(path, w, h, paint) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a === undefined ? 255 : a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  console.log(`wrote ${path}  ${w}x${h}`);
}

/** Switch-style box art inside [bx0,by0)-(bx1,by1); `bg` outside (null = skip). */
function boxPainter(bx0, by0, bx1, by1, hue, bg) {
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  return (x, y) => {
    if (x < bx0 || x >= bx1 || y < by0 || y >= by1) return bg;
    const u = (x - bx0) / bw;
    const v = (y - by0) / bh;
    if (v < 0.09) return [214, 0, 18, 255]; // red header band
    if (v < 0.105) return [255, 255, 255, 255]; // white rule
    if (v > 0.9) return [18, 18, 22, 255]; // rating / publisher band
    const cx = u - 0.5;
    const cy = v - 0.5;
    const r = Math.sqrt(cx * cx + cy * cy);
    const s = Math.sin(u * 18) * Math.cos(v * 14);
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    return [
      clamp(30 + 200 * (1 - r) * (hue % 3 === 0 ? 1 : 0.35) + 20 * s),
      clamp(20 + 180 * (1 - r) * (hue % 3 === 1 ? 1 : 0.3) + 20 * s),
      clamp(40 + 190 * (1 - r) * (hue % 3 === 2 ? 1 : 0.4) + 20 * s),
      255,
    ];
  };
}

mkdirSync(OUT, { recursive: true });
const out = (name) => join(OUT, name);

// A box floating in white — the reference-01 case the trim exists for.
writePNG(out("cover-white-margin.png"), 1000, 1000, boxPainter(290, 203, 710, 797, 0, [255, 255, 255, 255]));

// Off-white background with per-pixel noise, as a re-encoded JPEG would have.
{
  const paint = boxPainter(200, 250, 700, 950, 1, null);
  writePNG(out("cover-offwhite-margin.png"), 900, 1200, (x, y) => {
    const p = paint(x, y);
    if (p) return p;
    const n = ((x * 7 + y * 13) % 5) - 2;
    return [250 + n, 249 + n, 247 + n, 255];
  });
}

// Transparent padding — the alpha-bounds path.
{
  const paint = boxPainter(220, 146, 580, 654, 2, null);
  writePNG(out("cover-transparent-margin.png"), 800, 800, (x, y) => paint(x, y) ?? [0, 0, 0, 0]);
}

// Already tight: must come back untouched (reference 02).
writePNG(out("cover-tight.png"), 700, 990, boxPainter(0, 0, 700, 990, 0, [255, 255, 255, 255]));

// Print-resolution cover for the 3D sleeve.
writePNG(out("cover-hires.png"), 1400, 1980, boxPainter(0, 0, 1400, 1980, 1, [255, 255, 255, 255]));

// A wide banner. Must never be promoted into a cover slot.
writePNG(out("banner-wide.png"), 1280, 480, (x, y) => [
  Math.round(20 + 90 * (x / 1280)),
  Math.round(30 + 120 * (y / 480)),
  Math.round(90 + 100 * (1 - x / 1280)),
  255,
]);

// Dedicated square card artwork.
writePNG(out("square-card.png"), 600, 600, (x, y) => {
  const u = x / 600;
  const v = y / 600;
  const d = Math.abs(u - 0.5) + Math.abs(v - 0.5);
  return [Math.round(230 * (1 - d)), Math.round(60 + 120 * v), Math.round(40 + 160 * u), 255];
});

// Near-blank plate: fails the import quality check, and is never cropped.
writePNG(out("blank.png"), 400, 560, () => [253, 253, 253, 255]);
