import { describe, expect, it } from "vitest";

import { candidatesFor, looksLikeWrap, validateCandidate, WRAP_ASPECT } from "./lib/media-candidates.mjs";

const png = (w, h) => ({ width: w, height: h });
/** A sharp stand-in: reports whatever dimensions the test wants. */
const fakeSharp = (meta) => () => ({ metadata: async () => meta });

const okResponse = (bytes = 4096) =>
  new Response(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes)]), {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });

describe("candidatesFor", () => {
  const product = {
    productImage: { publicId: "store/software/switch/700100/cover" },
    'productImage({"shape":"square"})': { url: "https://assets.nintendo.com/image/fetch/x/square" },
    productGallery: [
      { publicId: "store/software/switch/700100/shot-a", resourceType: "image" },
      { publicId: "/store/software/switch/700100/Video/trailer", resourceType: "video" },
    ],
  };

  it("offers productImage to both the packshot and the hero role", () => {
    const c = candidatesFor(product);
    expect(c.cartridgeImage).toHaveLength(1);
    expect(c.coverImage).toHaveLength(1);
    expect(c.cartridgeImage[0].url).toBe(c.coverImage[0].url);
  });

  it("takes the square asset only when it differs from the packshot", () => {
    expect(candidatesFor(product).nintendoCardImage).toHaveLength(1);
    const same = {
      productImage: { url: "https://x/same" },
      'productImage({"shape":"square"})': { url: "https://x/same" },
    };
    expect(candidatesFor(same).nintendoCardImage).toHaveLength(0);
  });

  it("takes screenshots but never trailers or the packshot", () => {
    const c = candidatesFor(product);
    expect(c.galleryImages).toHaveLength(1);
    expect(c.galleryImages[0].url).toContain("shot-a");
  });

  it("leaves the wrap and the banners without a candidate rather than borrowing one", () => {
    const c = candidatesFor(product);
    expect(c.coverHiResImage).toEqual([]);
    expect(c.bannerImages).toEqual([]);
  });

  it("survives a product with no media at all", () => {
    const c = candidatesFor({});
    for (const list of Object.values(c)) expect(list).toEqual([]);
  });
});

describe("looksLikeWrap", () => {
  it("accepts the sleeve's authored 1236 × 951 layout", () => {
    expect(looksLikeWrap(1236, 951)).toBe(true);
    expect(looksLikeWrap(2472, 1902)).toBe(true);
    expect(Math.round(WRAP_ASPECT * 1000)).toBe(1300);
  });

  it("refuses a 16:9 promo and a portrait packshot", () => {
    expect(looksLikeWrap(1920, 1080)).toBe(false);
    expect(looksLikeWrap(1000, 1600)).toBe(false);
  });
});

describe("validateCandidate", () => {
  const candidate = { url: "https://example.test/a.jpg", provenance: "test" };
  const withFetch = async (response, meta, role) => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => response;
    try {
      return await validateCandidate(candidate, role, fakeSharp(meta));
    } finally {
      globalThis.fetch = original;
    }
  };

  it("routes a landscape productImage to the hero role and refuses it as a packshot", async () => {
    const hero = await withFetch(okResponse(), png(1920, 1080), "coverImage");
    expect(hero.ok).toBe(true);
    expect(hero.shapeOk).toBe(true);

    const box = await withFetch(okResponse(), png(1920, 1080), "cartridgeImage");
    expect(box.ok).toBe(true);
    expect(box.shapeOk).toBe(false);
    expect(box.reason).toMatch(/wants portrait/);
  });

  it("accepts a portrait packshot as the front box", async () => {
    const box = await withFetch(okResponse(), png(1000, 1600), "cartridgeImage");
    expect(box.shapeOk).toBe(true);
  });

  it("refuses a tracking pixel that is technically an image", async () => {
    const tiny = await withFetch(okResponse(), png(1, 1), "coverImage");
    expect(tiny.ok).toBe(false);
    expect(tiny.reason).toMatch(/too small/);
  });

  it("refuses a page served where an image was expected", async () => {
    const html = new Response(Buffer.from("<!DOCTYPE html><html></html>"), {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const result = await withFetch(html, png(1920, 1080), "coverImage");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("html");
  });

  it("refuses an HTTP error rather than storing the error body", async () => {
    const result = await withFetch(new Response("nope", { status: 400 }), png(0, 0), "cartridgeImage");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("http-error");
    expect(result.status).toBe(400);
  });

  it("only calls a wrap a wrap at the sleeve's own aspect", async () => {
    const wide = await withFetch(okResponse(), png(1920, 1080), "coverHiResImage");
    expect(wide.shapeOk).toBe(false);
    const wrap = await withFetch(okResponse(), png(1236, 951), "coverHiResImage");
    expect(wrap.shapeOk).toBe(true);
  });
});
