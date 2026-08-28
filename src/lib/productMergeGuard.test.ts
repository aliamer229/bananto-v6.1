import { describe, expect, it } from "vitest";

import {
  MAX_FIELD_BYTES,
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

  it("refuses the payload that made one product 76% of the catalogue", () => {
    /*
      street-fighter-6-switch-2 carried a 5.9 MB base64 JPEG in
      coverHiResImage. The document was 5.67 MB; every catalogue read paid for
      it.
    */
    const { merged, rejectedMedia, changed } = mergeProductUpdate(base(), {
      coverHiResImage: dataUri(5_900_000),
      price: 15000,
    } as Partial<Product>);

    expect(rejectedMedia).toMatchObject([{ field: "coverHiResImage", reason: "data-uri" }]);
    expect(rejectedMedia[0]!.bytes).toBeGreaterThan(5_000_000);
    // The stored URL survives untouched, and the real edit still lands.
    expect(merged.coverHiResImage).toBe("/api/files/products/prd_1/3d.webp");
    expect(merged.price).toBe(15000);
    expect(changed).toEqual(["price"]);
  });

  it("refuses an oversized non-data-uri string too", () => {
    const { rejectedMedia } = mergeProductUpdate(base(), {
      description: "x".repeat(MAX_FIELD_BYTES + 1),
    } as Partial<Product>);
    expect(rejectedMedia).toMatchObject([{ field: "description", reason: "oversized" }]);
  });

  it("accepts an ordinary URL, which is the whole point", () => {
    const { merged, rejectedMedia } = mergeProductUpdate(base(), {
      coverHiResImage: "/api/files/products/prd_1/3d-texture-abc123.webp",
    } as Partial<Product>);
    expect(rejectedMedia).toEqual([]);
    expect(merged.coverHiResImage).toBe("/api/files/products/prd_1/3d-texture-abc123.webp");
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
