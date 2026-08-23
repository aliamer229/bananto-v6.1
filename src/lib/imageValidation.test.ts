import { describe, expect, it } from "vitest";

import { parseGameImport } from "./gameImportParser";
import { isMostlyBlank, validateImageUrlShape } from "./imageValidation";

describe("validateImageUrlShape", () => {
  it("accepts real URLs", () => {
    for (const url of [
      "https://cdn.example/cover.jpg",
      "http://cdn.example/cover.png?v=2",
      "/img/cover.webp",
      "data:image/png;base64,iVBORw0KG",
    ]) {
      expect(validateImageUrlShape(url)).toEqual({ ok: true, value: url });
    }
  });

  it("trims surrounding whitespace", () => {
    expect(validateImageUrlShape("  https://cdn.example/a.jpg  ").value).toBe(
      "https://cdn.example/a.jpg",
    );
  });

  it("rejects the values a broken feed actually produces", () => {
    const bad = ["[object Object]", "undefined", "null", "   ", "", "NaN", "#"];
    for (const value of bad) {
      const result = validateImageUrlShape(value);
      expect(result.ok, `expected ${JSON.stringify(value)} to be rejected`).toBe(false);
      expect(result.issue?.severity).toBe("warning");
    }
  });

  it("rejects a nested object rather than stringifying it", () => {
    const result = validateImageUrlShape({ url: "https://cdn.example/a.jpg" });
    expect(result.ok).toBe(false);
    expect(result.issue?.code).toBe("malformed");
  });

  it("rejects javascript: URLs", () => {
    expect(validateImageUrlShape("javascript:alert(1)").ok).toBe(false);
  });
});

describe("isMostlyBlank", () => {
  const fill = (n: number, colour: [number, number, number]) => {
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = colour[0];
      data[i * 4 + 1] = colour[1];
      data[i * 4 + 2] = colour[2];
      data[i * 4 + 3] = 255;
    }
    return data;
  };

  it("flags a solid plate", () => {
    expect(isMostlyBlank(fill(1000, [253, 253, 253]))).toBe(true);
  });

  it("does not flag artwork", () => {
    const data = fill(1000, [255, 255, 255]);
    for (let i = 0; i < 400; i++) {
      data[i * 4] = (i * 7) % 255;
      data[i * 4 + 1] = (i * 13) % 255;
      data[i * 4 + 2] = (i * 3) % 255;
    }
    expect(isMostlyBlank(data)).toBe(false);
  });
});

describe("import parser image handling", () => {
  const base = "schema_version=1\nname=Test Game\nplatform=switch1\n";

  it("keeps a valid front cover under either key name", () => {
    const a = parseGameImport(`${base}front_cover_image=https://cdn.example/front.jpg\n`);
    expect(a.data["cartridgeImage"]).toBe("https://cdn.example/front.jpg");

    const b = parseGameImport(`${base}cartridge_image=https://cdn.example/front.jpg\n`);
    expect(b.data["cartridgeImage"]).toBe("https://cdn.example/front.jpg");
  });

  it("maps the new square card key to its own field", () => {
    const result = parseGameImport(`${base}nintendo_card_image=https://cdn.example/square.jpg\n`);
    expect(result.data["nintendoCardImage"]).toBe("https://cdn.example/square.jpg");
    // and never onto the cover
    expect(result.data["cartridgeImage"]).toBeUndefined();
  });

  it("maps the hi-res key to the 3D texture field", () => {
    const result = parseGameImport(`${base}front_cover_hires_url=https://cdn.example/hi.png\n`);
    expect(result.data["coverHiResImage"]).toBe("https://cdn.example/hi.png");
  });

  it("drops a malformed image value instead of storing it", () => {
    const result = parseGameImport(`${base}cartridge_image=[object Object]\n`);
    expect(result.data["cartridgeImage"]).toBeUndefined();
  });

  it("reports a malformed image as a warning, so the import still runs", () => {
    const result = parseGameImport(`${base}cartridge_image=[object Object]\n`);
    const blocking = result.errors.filter((e) => e.severity === "error");
    expect(blocking).toHaveLength(0);
    expect(result.errors.some((e) => e.severity === "warning" && e.key === "cartridge_image")).toBe(
      true,
    );
    // The rest of the record survives.
    expect(result.data["title"]).toBe("Test Game");
    expect(result.data["platform"]).toBe("switch1");
  });

  it("still accepts a bare domain path, which some feeds emit", () => {
    const result = parseGameImport(`${base}cartridge_image=cdn.example.com/art/front.png\n`);
    expect(result.data["cartridgeImage"]).toBe("cdn.example.com/art/front.png");
  });

  it("does not confuse the cover, the square card and the banner", () => {
    const result = parseGameImport(
      `${base}front_cover_image=https://cdn.example/front.jpg\n` +
        `nintendo_card_image=https://cdn.example/square.jpg\n` +
        `banner_image.1=https://cdn.example/banner.jpg\n`,
    );
    expect(result.data["cartridgeImage"]).toBe("https://cdn.example/front.jpg");
    expect(result.data["nintendoCardImage"]).toBe("https://cdn.example/square.jpg");
    expect(result.data["bannerImages"]).toEqual(["https://cdn.example/banner.jpg"]);
  });
});
