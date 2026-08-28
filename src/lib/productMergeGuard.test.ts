import { describe, expect, it } from "vitest";

import {
  MAX_MEDIA_FIELD_BYTES,
  contentSize,
  destructiveUpdateLog,
  mergeProductUpdate,
  oversizedMediaLog,
} from "./productMergeGuard";
import type { Product } from "./types";

const base = (over: Partial<Product> = {}): Product =>
  ({
    id: "prd_1",
    title: "Yoshi",
    price: 12000,
    stock: 2,
    status: "نشط",
    categoryId: "cat_nintendo",
    cartridgeImage: "/api/files/products/prd_1/front.avif",
    nintendoCardImage: "/api/files/products/prd_1/square.avif",
    coverImage: "/api/files/products/prd_1/cover.avif",
    coverHiResImage: "/api/files/products/prd_1/3d.webp",
    bannerImages: ["b0.avif", "b1.avif", "b2.avif"],
    gallery: ["g0.webp"],
    variants: [{ name: "standard" }],
    devicePerformance: [{ device: "switch2" }],
    nintendo: { gameKeyCard: true },
    ...over,
  }) as unknown as Product;

describe("contentSize", () => {
  it("treats the editor's empty defaults as nothing", () => {
    // These are exactly what AdminProductEditor produces from a listing row.
    for (const empty of ["", "   ", [], [""], ["", ""], {}, { a: "" }, null, undefined]) {
      expect(contentSize(empty)).toBe(0);
    }
  });

  it("counts real content", () => {
    expect(contentSize("x")).toBe(1);
    expect(contentSize(["a", "", "b"])).toBe(2);
    expect(contentSize({ a: "v" })).toBe(1);
    expect(contentSize(0)).toBe(1);
    expect(contentSize(false)).toBe(0);
  });
});

describe("mergeProductUpdate", () => {
  it("keeps every field the patch does not mention", () => {
    const { merged, blocked } = mergeProductUpdate(base(), { price: 15000 });
    expect(merged.price).toBe(15000);
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front.avif");
    expect(merged.bannerImages).toHaveLength(3);
    expect(merged.nintendo).toEqual({ gameKeyCard: true });
    expect(blocked).toEqual([]);
  });

  it("refuses the exact save that caused this incident", () => {
    /*
      A form opened on a listing row: every rich field defaults to empty and
      diffs as changed. Before the guard this spread straight over the stored
      product and erased all four image roles, the banners and the gallery.
    */
    const patch = {
      cartridgeImage: "",
      nintendoCardImage: "",
      coverImage: "",
      coverHiResImage: "",
      bannerImages: [""],
      gallery: [],
      variants: [],
      devicePerformance: [],
      nintendo: {},
      price: 15000,
    } as Partial<Product>;

    const { merged, blocked, changed } = mergeProductUpdate(base(), patch);

    expect(blocked.map((b) => b.field).sort()).toEqual(
      [
        "bannerImages", "cartridgeImage", "coverHiResImage", "coverImage",
        "devicePerformance", "gallery", "nintendo", "nintendoCardImage", "variants",
      ].sort(),
    );
    // The legitimate edit still lands.
    expect(merged.price).toBe(15000);
    expect(changed).toEqual(["price"]);
    // Nothing rich was lost.
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front.avif");
    expect(merged.nintendoCardImage).toBe("/api/files/products/prd_1/square.avif");
    expect(merged.coverImage).toBe("/api/files/products/prd_1/cover.avif");
    expect(merged.coverHiResImage).toBe("/api/files/products/prd_1/3d.webp");
    expect(merged.bannerImages).toHaveLength(3);
    expect(merged.gallery).toHaveLength(1);
    expect(merged.variants).toHaveLength(1);
  });

  it("keeps the image roles distinct — clearing one leaves the others alone", () => {
    const { merged, blocked, cleared } = mergeProductUpdate(
      base(),
      { nintendoCardImage: "" },
      { clear: ["nintendoCardImage"] },
    );
    expect(blocked).toEqual([]);
    expect(cleared).toEqual(["nintendoCardImage"]);
    expect(merged.nintendoCardImage).toBe("");
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front.avif");
    expect(merged.coverImage).toBe("/api/files/products/prd_1/cover.avif");
    expect(merged.coverHiResImage).toBe("/api/files/products/prd_1/3d.webp");
  });

  it("allows a real replacement, which is not a deletion", () => {
    const { merged, blocked } = mergeProductUpdate(base(), {
      cartridgeImage: "/api/files/products/prd_1/front-v2.avif",
    });
    expect(blocked).toEqual([]);
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front-v2.avif");
  });

  it("allows emptiness over emptiness — there is nothing to protect", () => {
    const { merged, blocked } = mergeProductUpdate(base({ gallery: [] }), { gallery: [] });
    expect(blocked).toEqual([]);
    expect(merged.gallery).toEqual([]);
  });

  it("lets unprotected fields be cleared freely", () => {
    const { merged, blocked } = mergeProductUpdate(base({ badge: "جديد" } as any), {
      badge: "",
    } as Partial<Product>);
    expect(blocked).toEqual([]);
    expect((merged as any).badge).toBe("");
  });

  it("treats an explicitly undefined key as absent, not as a clear", () => {
    const { merged, blocked } = mergeProductUpdate(base(), {
      cartridgeImage: undefined,
    } as Partial<Product>);
    expect(blocked).toEqual([]);
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front.avif");
  });

  it("names the loss it prevented, so the log is actionable", () => {
    const { blocked } = mergeProductUpdate(base(), { bannerImages: [], variants: [] });
    const line = destructiveUpdateLog("prd_1", blocked);
    expect(line).toContain("DESTRUCTIVE_PRODUCT_UPDATE_BLOCKED");
    expect(line).toContain("prd_1");
    expect(line).toContain("bannerImages:3->0");
    expect(line).toContain("variants:1->0");
  });
});

describe("embedded media", () => {
  const dataUri = (bytes: number) => `data:image/jpeg;base64,${"A".repeat(bytes)}`;
  /* Long-form prose: the kind of value the first version of this guard broke. */
  const prose = (bytes: number) =>
    "لعبة رائعة. ".repeat(Math.ceil(bytes / 12)).slice(0, bytes);

  it("keeps a description well over 8 KB", () => {
    const text = prose(20_000);
    const { merged, rejectedMedia } = mergeProductUpdate(base(), {
      description: text,
    } as Partial<Product>);
    expect(rejectedMedia).toEqual([]);
    expect(merged.description).toBe(text);
  });

  it("keeps long FAQ, guides, reviews, patch notes and story content", () => {
    const long = prose(12_000);
    const patch = {
      faq: [{ q: "سؤال", a: long }],
      guides: [{ title: "دليل", summary: long, url: "https://example.com" }],
      reviews: [{ source: "IGN", quote: long }],
      patchNotes: [{ version: "1.2", body: long }],
      storyChapters: [{ title: "الفصل", body: long }],
      sources: [{ name: "Nintendo", url: "https://nintendo.com" }],
    } as unknown as Partial<Product>;
    const { merged, rejectedMedia } = mergeProductUpdate(base(), patch);
    expect(rejectedMedia).toEqual([]);
    expect((merged as any).faq[0].a).toBe(long);
    expect((merged as any).guides[0].summary).toBe(long);
    expect((merged as any).patchNotes[0].body).toBe(long);
    expect((merged as any).storyChapters[0].body).toBe(long);
  });

  it("refuses the base64 payload that made one product 76% of the catalogue", () => {
    const { merged, rejectedMedia, changed } = mergeProductUpdate(base(), {
      coverHiResImage: dataUri(5_900_000),
      price: 15000,
    } as Partial<Product>);
    expect(rejectedMedia).toMatchObject([{ field: "coverHiResImage", reason: "data-uri" }]);
    expect(rejectedMedia[0]!.bytes).toBeGreaterThan(5_000_000);
    // The stored URL survives, and the legitimate edit still lands.
    expect(merged.coverHiResImage).toBe("/api/files/products/prd_1/3d.webp");
    expect(merged.price).toBe(15000);
    expect(changed).toEqual(["price"]);
  });

  it("refuses a large inline payload inside a media field", () => {
    const { merged, rejectedMedia } = mergeProductUpdate(base(), {
      // Long but not base64-shaped, so it is the media-field length rule that
      // catches it rather than the blob rule.
      cartridgeImage: "https://example.com/" + "seg-".repeat(MAX_MEDIA_FIELD_BYTES),
    } as Partial<Product>);
    expect(rejectedMedia).toMatchObject([
      { field: "cartridgeImage", reason: "oversized-media-field" },
    ]);
    expect(merged.cartridgeImage).toBe("/api/files/products/prd_1/front.avif");
  });

  it("refuses a payload hidden in a gallery array entry", () => {
    const { merged, rejectedMedia } = mergeProductUpdate(base({ galleryImages: ["a.webp"] } as any), {
      galleryImages: ["b.webp", dataUri(50_000)],
    } as unknown as Partial<Product>);
    expect(rejectedMedia).toMatchObject([{ field: "galleryImages", reason: "data-uri" }]);
    expect((merged as any).galleryImages).toEqual(["a.webp"]);
  });

  it("accepts a normal R2 reference", () => {
    const url = "/api/files/products/prd_1/3d-texture-abc123.webp";
    const { merged, rejectedMedia } = mergeProductUpdate(base(), {
      coverHiResImage: url,
    } as Partial<Product>);
    expect(rejectedMedia).toEqual([]);
    expect(merged.coverHiResImage).toBe(url);
  });

  it("accepts a normal https image URL", () => {
    const url = "https://assets.nintendo.com/image/upload/store/software/switch2/70010000103459.jpg";
    const { merged, rejectedMedia } = mergeProductUpdate(base(), {
      coverImage: url,
    } as Partial<Product>);
    expect(rejectedMedia).toEqual([]);
    expect(merged.coverImage).toBe(url);
  });

  it("names what it rejected so the log is actionable", () => {
    const { rejectedMedia } = mergeProductUpdate(base(), {
      coverHiResImage: dataUri(9000),
    } as Partial<Product>);
    const line = oversizedMediaLog("prd_1", rejectedMedia);
    expect(line).toContain("EMBEDDED_MEDIA_REJECTED");
    expect(line).toContain("coverHiResImage:data-uri");
  });
});
