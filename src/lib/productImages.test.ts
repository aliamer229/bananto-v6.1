import { describe, expect, it } from "vitest";

import { NINTENDO_IMAGE_PLACEHOLDER } from "./nintendoImages";
import { productGalleryImages, resolveProductImage } from "./productImages";

const url = (name: string) => `https://cdn.test/${name}.webp`;

describe("resolveProductImage", () => {
  it("gives each context its own first choice", () => {
    const product = {
      listingImage: url("listing"),
      mainImage: url("main"),
      coverImage: url("cover"),
      thumbnailImage: url("thumb"),
    };
    expect(resolveProductImage(product, "listing").url).toBe(url("listing"));
    expect(resolveProductImage(product, "hero").url).toBe(url("main"));
    expect(resolveProductImage(product, "background").url).toBe(url("cover"));
    expect(resolveProductImage(product, "thumbnail").url).toBe(url("thumb"));
  });

  it("walks its own chain in order and reports which field answered", () => {
    const product = { frontImage: url("front"), packagingFrontImage: url("pack") };
    const listing = resolveProductImage(product, "listing");
    expect(listing).toMatchObject({ url: url("front"), source: "front" });
    expect(listing.fallbackUrls).toEqual([url("pack")]);
  });

  it("never lets a banner stand in for a hero or a card", () => {
    const product = { bannerImage: url("banner") };
    expect(resolveProductImage(product, "hero").isPlaceholder).toBe(true);
    expect(resolveProductImage(product, "listing").isPlaceholder).toBe(true);
    // The background is the one context a banner legitimately belongs to.
    expect(resolveProductImage(product, "background").url).toBe(url("banner"));
  });

  it("lets a listing card reach the gallery, but never a hero", () => {
    const product = { gallery: [{ url: url("shot") }] };
    expect(resolveProductImage(product, "listing").url).toBe(url("shot"));
    expect(resolveProductImage(product, "hero").url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
  });

  it("reads the snake_case names old rows were saved under", () => {
    expect(resolveProductImage({ main_image: url("legacy") }, "hero").url).toBe(url("legacy"));
  });

  it("rejects the junk import feeds produce instead of rendering a broken image", () => {
    for (const junk of ["[object Object]", "undefined", "null", "   ", ""]) {
      expect(resolveProductImage({ mainImage: junk }, "hero").isPlaceholder).toBe(true);
    }
  });

  it("returns the placeholder rather than nothing when a product has no artwork", () => {
    expect(resolveProductImage({}, "listing")).toMatchObject({
      url: NINTENDO_IMAGE_PLACEHOLDER,
      isPlaceholder: true,
      fallbackUrls: [],
    });
    expect(resolveProductImage(null, "hero").isPlaceholder).toBe(true);
  });
});

describe("productGalleryImages", () => {
  it("orders named roles anatomically, then the free-form gallery, with no repeats", () => {
    const images = productGalleryImages({
      backImage: url("back"),
      mainImage: url("main"),
      frontImage: url("front"),
      packagingFrontImage: url("pack"),
      gallery: [{ url: url("extra") }, { url: url("main") }],
      lifestyleImages: [url("life")],
    });
    expect(images).toEqual([
      url("main"),
      url("front"),
      url("back"),
      url("pack"),
      url("extra"),
      url("life"),
    ]);
  });

  it("is empty for a product with no pictures, so a gallery section can disappear", () => {
    expect(productGalleryImages({ title: "x" })).toEqual([]);
  });
});
