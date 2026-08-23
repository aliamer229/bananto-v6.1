import { describe, expect, it } from "vitest";

import {
  computeTrimBox,
  isValidTrim,
  trimToImageStyle,
  trimmedAspect,
  TRIM_VERSION,
} from "./imageTrim";

type Paint = (x: number, y: number) => [number, number, number, number];

function pixels(width: number, height: number, paint: Paint): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

/** A box of artwork sitting inside a background field, like reference 01. */
function boxInField(
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
  bg: [number, number, number, number],
): Uint8ClampedArray {
  return pixels(width, height, (x, y) => {
    const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
    if (!inside) return bg;
    // Deterministic artwork with a red band at the top, like a real cover.
    if (y - box.y < box.h * 0.1) return [214, 0, 18, 255];
    return [40 + ((x * 7) % 120), 30 + ((y * 5) % 110), 90 + ((x + y) % 90), 255];
  });
}

describe("computeTrimBox", () => {
  it("finds the artwork inside a white field (reference 01 → 02)", () => {
    const trim = computeTrimBox(
      boxInField(200, 200, { x: 58, y: 40, w: 84, h: 120 }, [255, 255, 255, 255]),
      200,
      200,
    );
    expect(trim).not.toBeNull();
    // Within the safe inset of the true bounds (58/200, 40/200, 84/200, 120/200).
    expect(trim!.left).toBeCloseTo(0.29, 1);
    expect(trim!.top).toBeCloseTo(0.2, 1);
    expect(trim!.width).toBeCloseTo(0.42, 1);
    expect(trim!.height).toBeCloseTo(0.6, 1);
    expect(trim!.mode).toBe("luminance");
    expect(trim!.version).toBe(TRIM_VERSION);
  });

  it("tolerates an off-white JPEG background with per-pixel noise", () => {
    const width = 200;
    const height = 240;
    const base = boxInField(width, height, { x: 50, y: 40, w: 100, h: 150 }, [250, 249, 247, 255]);
    for (let i = 0; i < base.length; i += 4) {
      const noise = ((i / 4) % 5) - 2;
      if (base[i] === 250) {
        base[i] = 250 + noise;
        base[i + 1] = 249 + noise;
        base[i + 2] = 247 + noise;
      }
    }
    const trim = computeTrimBox(base, width, height);
    expect(trim).not.toBeNull();
    expect(trim!.left).toBeCloseTo(0.25, 1);
    expect(trim!.width).toBeCloseTo(0.5, 1);
  });

  it("uses alpha bounds when the padding is transparent", () => {
    const trim = computeTrimBox(
      boxInField(160, 160, { x: 40, y: 20, w: 80, h: 118 }, [0, 0, 0, 0]),
      160,
      160,
    );
    expect(trim).not.toBeNull();
    expect(trim!.mode).toBe("alpha");
    expect(trim!.width).toBeCloseTo(0.5, 1);
  });

  it("leaves an already-tight cover alone (reference 02 stays as it is)", () => {
    const tight = boxInField(140, 200, { x: 0, y: 0, w: 140, h: 200 }, [255, 255, 255, 255]);
    expect(computeTrimBox(tight, 140, 200)).toBeNull();
  });

  it("refuses artwork whose own edges are dark", () => {
    // A cover that bleeds to the edge has no padding to remove, and cropping
    // against a dark border would cut into the picture.
    const bled = pixels(160, 200, (x, y) => [20 + ((x * 3) % 60), 10 + ((y * 3) % 60), 60, 255]);
    expect(computeTrimBox(bled, 160, 200)).toBeNull();
  });

  it("refuses a coloured (non-neutral) border", () => {
    const onRed = boxInField(160, 200, { x: 40, y: 40, w: 80, h: 120 }, [255, 210, 210, 255]);
    expect(computeTrimBox(onRed, 160, 200)).toBeNull();
  });

  it("refuses to over-crop a mostly-blank image", () => {
    // A tiny mark in a huge white field would crop away 95% of the frame.
    const speck = boxInField(300, 300, { x: 145, y: 145, w: 10, h: 10 }, [255, 255, 255, 255]);
    expect(computeTrimBox(speck, 300, 300)).toBeNull();
  });

  it("refuses a result with an implausible aspect ratio", () => {
    const sliver = boxInField(300, 300, { x: 10, y: 140, w: 280, h: 20 }, [255, 255, 255, 255]);
    expect(computeTrimBox(sliver, 300, 300)).toBeNull();
  });

  it("returns null for a completely blank image", () => {
    expect(
      computeTrimBox(
        pixels(120, 160, () => [252, 252, 252, 255]),
        120,
        160,
      ),
    ).toBeNull();
  });

  it("returns null for degenerate input", () => {
    expect(computeTrimBox(new Uint8ClampedArray(0), 0, 0)).toBeNull();
    expect(computeTrimBox(new Uint8ClampedArray(16), 4, 4)).toBeNull();
  });

  it("is deterministic — the same bytes always give the same box", () => {
    const data = boxInField(200, 200, { x: 58, y: 40, w: 84, h: 120 }, [255, 255, 255, 255]);
    const a = computeTrimBox(data, 200, 200);
    const b = computeTrimBox(data, 200, 200);
    expect(a).toEqual(b);
  });

  it("never crops into the artwork's own bounds", () => {
    const box = { x: 58, y: 40, w: 84, h: 120 };
    const trim = computeTrimBox(boxInField(200, 200, box, [255, 255, 255, 255]), 200, 200)!;
    // The safe inset only ever adds padding back, so the kept region must
    // contain every artwork pixel.
    expect(trim.left * 200).toBeLessThanOrEqual(box.x);
    expect(trim.top * 200).toBeLessThanOrEqual(box.y);
    expect((trim.left + trim.width) * 200).toBeGreaterThanOrEqual(box.x + box.w);
    expect((trim.top + trim.height) * 200).toBeGreaterThanOrEqual(box.y + box.h);
  });
});

describe("isValidTrim", () => {
  it("accepts a well-formed box", () => {
    expect(isValidTrim({ left: 0.1, top: 0.1, width: 0.8, height: 0.8 })).toBe(true);
  });

  it("rejects malformed, out-of-range and no-op boxes", () => {
    expect(isValidTrim(null)).toBe(false);
    expect(isValidTrim("0.1")).toBe(false);
    expect(isValidTrim({ left: 0, top: 0, width: 1, height: 1 })).toBe(false);
    expect(isValidTrim({ left: 0.5, top: 0, width: 0.8, height: 0.5 })).toBe(false);
    expect(isValidTrim({ left: -0.1, top: 0, width: 0.5, height: 0.5 })).toBe(false);
    expect(isValidTrim({ left: 0, top: 0, width: 0, height: 0.5 })).toBe(false);
  });

  it("rejects a box written by an older algorithm", () => {
    expect(isValidTrim({ left: 0.1, top: 0.1, width: 0.8, height: 0.8, version: 0 })).toBe(false);
  });
});

describe("trimToImageStyle", () => {
  it("scales and offsets so the crop lands on the window exactly", () => {
    const style = trimToImageStyle({ left: 0.25, top: 0.2, width: 0.5, height: 0.6 });
    expect(style.width).toBe("200%");
    expect(style.left).toBe("-50%");
    expect(String(style.height)).toBe(`${(1 / 0.6) * 100}%`);
    expect(String(style.top)).toBe(`${(-0.2 / 0.6) * 100}%`);
  });

  it("falls back to filling the window when there is no crop", () => {
    expect(trimToImageStyle(null).width).toBe("100%");
    expect(trimToImageStyle(undefined).height).toBe("100%");
  });
});

describe("trimmedAspect", () => {
  it("returns the source aspect when nothing was cropped", () => {
    expect(trimmedAspect(null, 0.75)).toBe(0.75);
  });

  it("recomputes the aspect of the kept region", () => {
    // A square file whose artwork is 0.5 wide and 0.75 tall is 0.666 after trim.
    expect(trimmedAspect({ left: 0.25, top: 0.1, width: 0.5, height: 0.75 }, 1)).toBeCloseTo(
      0.6667,
      3,
    );
  });

  it("returns null without a usable source aspect", () => {
    expect(trimmedAspect(null, 0)).toBeNull();
    expect(trimmedAspect(null, null)).toBeNull();
  });
});
