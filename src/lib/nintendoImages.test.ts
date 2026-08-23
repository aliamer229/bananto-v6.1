import { describe, expect, it } from "vitest";

import {
  FRONT_COVER_FIELDS,
  isUsableImageUrl,
  NINTENDO_IMAGE_PLACEHOLDER,
  resolveNintendoImage,
  resolveNintendoImageUrl,
  resolvePurchaseImage,
  SQUARE_CARD_FIELDS,
  TRIM_FIELDS,
} from "./nintendoImages";

const COVER = "https://cdn.example/cover.jpg";
const LEGACY = "https://cdn.example/legacy.jpg";
const SQUARE = "https://cdn.example/square.jpg";
const HIRES = "https://cdn.example/hires.png";
const BANNER = "https://cdn.example/banner.jpg";
const SHOT = "https://cdn.example/screenshot.jpg";

describe("isUsableImageUrl", () => {
  it("accepts absolute, root-relative and data URLs", () => {
    expect(isUsableImageUrl(COVER)).toBe(true);
    expect(isUsableImageUrl("/img/cover.png")).toBe(true);
    expect(isUsableImageUrl("data:image/png;base64,iVBOR")).toBe(true);
  });

  it("rejects the malformed values import feeds actually produce", () => {
    for (const bad of [
      "[object Object]",
      "undefined",
      "null",
      "   ",
      "",
      "NaN",
      "#",
      "javascript:alert(1)",
      "cover.png",
      42,
      null,
      undefined,
      { url: COVER },
      [COVER],
    ]) {
      expect(isUsableImageUrl(bad)).toBe(false);
    }
  });
});

describe("resolveNintendoImage — front cover", () => {
  it("prefers the canonical cartridge image", () => {
    const hit = resolveNintendoImage(
      { cartridgeImage: COVER, coverImage: LEGACY, image: LEGACY },
      "front-cover",
    );
    expect(hit.url).toBe(COVER);
    expect(hit.source).toBe("cartridgeImage");
    expect(hit.isPlaceholder).toBe(false);
  });

  it("falls back through the legacy cover carriers in a fixed order", () => {
    expect(resolveNintendoImageUrl({ coverImage: LEGACY }, "front-cover")).toBe(LEGACY);
    expect(resolveNintendoImageUrl({ coverUrl: LEGACY }, "front-cover")).toBe(LEGACY);
    expect(resolveNintendoImageUrl({ box_front_url: LEGACY }, "front-cover")).toBe(LEGACY);
    expect(resolveNintendoImageUrl({ image: LEGACY }, "front-cover")).toBe(LEGACY);
  });

  it("never promotes a banner or a screenshot into a cover slot", () => {
    const product = {
      bannerImage: BANNER,
      banner: BANNER,
      galleryImages: [{ url: SHOT }],
      gallery: [SHOT],
      images: [SHOT],
    };
    const hit = resolveNintendoImage(product, "front-cover");
    expect(hit.url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
    expect(hit.isPlaceholder).toBe(true);
  });

  it("skips malformed values and keeps looking", () => {
    const hit = resolveNintendoImage(
      { cartridgeImage: "[object Object]", coverImage: "   ", image: COVER },
      "front-cover",
    );
    expect(hit.url).toBe(COVER);
    expect(hit.source).toBe("image");
  });

  it("returns the placeholder for a product with no artwork at all", () => {
    expect(resolveNintendoImage({ id: "x" }, "front-cover").url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
    expect(resolveNintendoImage(null).url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
    expect(resolveNintendoImage(undefined).url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
  });

  it("carries a stored crop rectangle along with the cover", () => {
    const trim = { left: 0.2, top: 0.1, width: 0.6, height: 0.8 };
    const hit = resolveNintendoImage({ cartridgeImage: COVER, cartridgeImageTrim: trim });
    expect(hit.trim).toEqual(trim);
  });

  it("does not attach a crop belonging to a field it did not choose", () => {
    const hit = resolveNintendoImage({
      image: COVER,
      cartridgeImageTrim: { left: 0.2, top: 0.1, width: 0.6, height: 0.8 },
    });
    expect(hit.source).toBe("image");
    expect(hit.trim).toBeUndefined();
  });
});

describe("resolveNintendoImage — square card", () => {
  it("uses the dedicated square asset when one exists", () => {
    const hit = resolveNintendoImage(
      { nintendoCardImage: SQUARE, cartridgeImage: COVER },
      "square-card",
    );
    expect(hit.url).toBe(SQUARE);
    expect(hit.source).toBe("nintendoCardImage");
  });

  it("falls back to the front cover, never to a banner", () => {
    expect(
      resolveNintendoImageUrl({ cartridgeImage: COVER, bannerImage: BANNER }, "square-card"),
    ).toBe(COVER);
    expect(resolveNintendoImageUrl({ bannerImage: BANNER }, "square-card")).toBe(
      NINTENDO_IMAGE_PLACEHOLDER,
    );
  });

  it("does not let the square asset stand in for a front cover", () => {
    expect(resolveNintendoImageUrl({ nintendoCardImage: SQUARE }, "front-cover")).toBe(
      NINTENDO_IMAGE_PLACEHOLDER,
    );
  });
});

describe("resolveNintendoImage — 3D texture", () => {
  it("prefers the print-resolution source over the listing cover", () => {
    const hit = resolveNintendoImage(
      { coverHiResImage: HIRES, cartridgeImage: COVER },
      "3d-texture",
    );
    expect(hit.url).toBe(HIRES);
  });

  it("uses the front cover when no hi-res source exists", () => {
    expect(resolveNintendoImageUrl({ cartridgeImage: COVER }, "3d-texture")).toBe(COVER);
  });

  it("never uses a gallery frame as a texture", () => {
    expect(resolveNintendoImageUrl({ galleryImages: [{ url: SHOT }] }, "3d-texture")).toBe(
      NINTENDO_IMAGE_PLACEHOLDER,
    );
  });
});

describe("resolveNintendoImage — banner", () => {
  it("reads only banner fields, then the gallery", () => {
    expect(resolveNintendoImageUrl({ bannerImage: BANNER, cartridgeImage: COVER }, "banner")).toBe(
      BANNER,
    );
    expect(resolveNintendoImageUrl({ galleryImages: [{ url: SHOT }] }, "banner")).toBe(SHOT);
  });

  it("never falls back to a cover", () => {
    expect(resolveNintendoImageUrl({ cartridgeImage: COVER }, "banner")).toBe(
      NINTENDO_IMAGE_PLACEHOLDER,
    );
  });
});

describe("purchase surfaces agree", () => {
  it("gives the cart, the bundle card and the toast the same picture", () => {
    const product = {
      cartridgeImage: COVER,
      nintendoCardImage: SQUARE,
      bannerImage: BANNER,
      galleryImages: [{ url: SHOT }],
    };
    const urls = new Set(
      (["cart", "toast", "bundle-card", "listing-card", "front-cover"] as const).map(
        (usage) => resolveNintendoImage(product, usage).url,
      ),
    );
    expect([...urls]).toEqual([COVER]);
    expect(resolvePurchaseImage(product).url).toBe(COVER);
  });

  it("agrees on the placeholder too, rather than each surface guessing", () => {
    const product = { bannerImage: BANNER };
    expect(resolvePurchaseImage(product).url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
    expect(resolveNintendoImageUrl(product, "toast")).toBe(NINTENDO_IMAGE_PLACEHOLDER);
  });
});

describe("backwards compatibility", () => {
  it("renders a pre-migration product that only has `image`", () => {
    const hit = resolveNintendoImage({ id: "old", image: LEGACY });
    expect(hit.url).toBe(LEGACY);
    expect(hit.isPlaceholder).toBe(false);
  });

  it("renders a pre-migration product that only has `coverImage`", () => {
    expect(resolveNintendoImageUrl({ id: "old", coverImage: LEGACY })).toBe(LEGACY);
  });

  it("picks no artwork by title — there are no per-game special cases", () => {
    for (const title of ["Super Mario Odyssey", "Mario Kart 8 Deluxe", "Cyberpunk 2077"]) {
      expect(resolveNintendoImage({ title, titleEn: title }).url).toBe(NINTENDO_IMAGE_PLACEHOLDER);
    }
  });
});

describe("field taxonomy", () => {
  it("keeps the cover, square and banner field sets disjoint", () => {
    const banner = ["bannerImage", "banner", "keyArtUrl", "regionBanner"];
    for (const field of FRONT_COVER_FIELDS) {
      expect(SQUARE_CARD_FIELDS as readonly string[]).not.toContain(field);
      expect(banner).not.toContain(field);
    }
    for (const field of SQUARE_CARD_FIELDS) {
      expect(banner).not.toContain(field);
    }
  });

  it("names a distinct trim column for each field that can carry one", () => {
    const columns = Object.values(TRIM_FIELDS);
    expect(new Set(columns).size).toBe(columns.length);
    for (const [field, column] of Object.entries(TRIM_FIELDS)) {
      expect(column).not.toBe(field);
      expect(column.endsWith("Trim")).toBe(true);
    }
  });

  it("only claims a trim column for a field the resolver can actually pick", () => {
    const known = new Set<string>([...FRONT_COVER_FIELDS, ...SQUARE_CARD_FIELDS]);
    for (const field of Object.keys(TRIM_FIELDS)) {
      expect(known.has(field), `${field} has a trim column but is never resolved`).toBe(true);
    }
  });
});
