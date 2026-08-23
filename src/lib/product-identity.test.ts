import { describe, expect, it } from "vitest";

import {
  findConflictingProduct,
  findDuplicateProducts,
  normalizeProductPlatform,
  normalizeProductTitle,
  productIdentityKeys,
} from "./product-identity";

describe("normalizeProductTitle", () => {
  it("collapses the differences that are not differences", () => {
    const canonical = normalizeProductTitle("Mario Kart 8 Deluxe");
    for (const variant of [
      "  Mario Kart 8 Deluxe  ",
      "MARIO KART 8 DELUXE",
      "Mario  Kart   8 Deluxe",
      "Mario Kart 8 Deluxe!!!",
      "Mario Kart 8 Deluxe™",
      "Mario-Kart-8-Deluxe",
      "Mario Kart 8: Deluxe",
    ]) {
      expect(normalizeProductTitle(variant), variant).toBe(canonical);
    }
  });

  it("normalises composed and full-width forms", () => {
    expect(normalizeProductTitle("Ｍario Ｋart")).toBe(normalizeProductTitle("Mario Kart"));
  });

  it("folds the Arabic letters people type interchangeably", () => {
    const canonical = normalizeProductTitle("اسطورة زيلدا");
    for (const variant of ["أسطورة زيلدا", "إسطورة زيلدا", "الاسطورة".slice(2) + " زيلدا"]) {
      expect(normalizeProductTitle(variant), variant).toBe(canonical);
    }
    expect(normalizeProductTitle("لعبه")).toBe(normalizeProductTitle("لعبة"));
  });

  it("ignores tashkeel and invisible characters", () => {
    expect(normalizeProductTitle("مَارِيُو")).toBe(normalizeProductTitle("ماريو"));
    expect(normalizeProductTitle("ماريو‏")).toBe(normalizeProductTitle("ماريو"));
  });

  it("does NOT throw away non-Latin titles", () => {
    /*
      `normalizeName` in gameData/identity.ts strips everything outside
      [a-z0-9], so every Arabic title becomes "" under it — which would make
      every Arabic product a duplicate of every other. That is why this module
      exists.
    */
    expect(normalizeProductTitle("زيلدا")).not.toBe("");
    expect(normalizeProductTitle("زيلدا")).not.toBe(normalizeProductTitle("ماريو"));
  });

  it("reads & as and, so both spellings collide", () => {
    expect(normalizeProductTitle("Pokemon Sword & Shield")).toBe(
      normalizeProductTitle("Pokemon Sword and Shield"),
    );
  });

  it("returns empty for nothing usable", () => {
    for (const value of ["", "   ", "!!!", null, undefined, 42]) {
      expect(normalizeProductTitle(value as never)).toBe("");
    }
  });
});

describe("normalizeProductPlatform", () => {
  it("canonicalises the values the editor writes", () => {
    expect(normalizeProductPlatform("switch1")).toBe("switch1");
    expect(normalizeProductPlatform("Nintendo Switch 2")).toBe("switch2");
    expect(normalizeProductPlatform("both")).toBe("both");
    // Missing reads as the default the editor starts on.
    expect(normalizeProductPlatform(null)).toBe("switch1");
    expect(normalizeProductPlatform("")).toBe("switch1");
  });
});

describe("productIdentityKeys", () => {
  it("keys on the title AND the platform", () => {
    const a = productIdentityKeys({ id: "1", title: "Zelda", platform: "switch1" });
    const b = productIdentityKeys({ id: "2", title: "Zelda", platform: "switch2" });
    // The same game on two consoles is genuinely two products.
    expect(a).not.toEqual(b);
  });

  it("considers both title columns", () => {
    const keys = productIdentityKeys({
      id: "1",
      title: "زيلدا",
      titleEn: "Zelda",
      platform: "switch1",
    });
    expect(keys).toHaveLength(2);
  });

  it("has no key for a product with no usable title", () => {
    expect(productIdentityKeys({ id: "1", title: "  ", platform: "switch1" })).toEqual([]);
  });
});

describe("findConflictingProduct", () => {
  const catalogue = [
    { id: "p1", title: "Mario Kart 8 Deluxe", platform: "switch1" },
    { id: "p2", title: "أسطورة زيلدا", platform: "switch1" },
    { id: "p3", title: "Mario Kart 8 Deluxe", platform: "switch2" },
  ];

  it("catches a re-add that differs only in noise", () => {
    const conflict = findConflictingProduct(
      { id: "new", title: "  mario kart 8 deluxe!!  ", platform: "switch1" },
      catalogue,
    );
    expect(conflict?.id).toBe("p1");
  });

  it("catches an Arabic re-add, which the slug check could not", () => {
    const conflict = findConflictingProduct(
      { id: "new", title: "الاسطورة زيلدا".replace("ال", ""), platform: "switch1" },
      catalogue,
    );
    expect(conflict?.id).toBe("p2");
  });

  it("allows the same game on a different platform", () => {
    expect(
      findConflictingProduct(
        { id: "new", title: "Mario Kart 8 Deluxe", platform: "both" },
        catalogue,
      ),
    ).toBeNull();
  });

  it("does not report a product as a duplicate of itself", () => {
    expect(
      findConflictingProduct(
        { id: "p1", title: "Mario Kart 8 Deluxe", platform: "switch1" },
        catalogue,
        "p1",
      ),
    ).toBeNull();
  });

  it("says nothing about a product with no title", () => {
    expect(
      findConflictingProduct({ id: "new", title: "", platform: "switch1" }, catalogue),
    ).toBeNull();
  });
});

describe("findDuplicateProducts", () => {
  it("groups the collisions already in a catalogue", () => {
    const groups = findDuplicateProducts([
      { id: "p1", title: "Mario Kart 8 Deluxe", platform: "switch1" },
      { id: "p2", title: "mario kart 8 deluxe", platform: "switch1" },
      { id: "p3", title: "MARIO KART 8 DELUXE!!", platform: "switch1" },
      { id: "p4", title: "Mario Kart 8 Deluxe", platform: "switch2" },
      { id: "p5", title: "Splatoon 3", platform: "switch1" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.products.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    // Order is preserved, so the oldest entry — the one most likely to own the
    // orders and reviews — is first.
    expect(groups[0]?.platform).toBe("switch1");
  });

  it("is a report: it returns groups and changes nothing", () => {
    const catalogue = [
      { id: "p1", title: "Zelda", platform: "switch1" },
      { id: "p2", title: "zelda", platform: "switch1" },
    ];
    const snapshot = JSON.stringify(catalogue);
    findDuplicateProducts(catalogue);
    expect(JSON.stringify(catalogue)).toBe(snapshot);
  });

  it("does not count a product whose two titles normalise the same as a duplicate", () => {
    expect(
      findDuplicateProducts([{ id: "p1", title: "Zelda", titleEn: "ZELDA", platform: "switch1" }]),
    ).toEqual([]);
  });

  it("finds nothing in a clean catalogue", () => {
    expect(
      findDuplicateProducts([
        { id: "p1", title: "Zelda", platform: "switch1" },
        { id: "p2", title: "Mario", platform: "switch1" },
      ]),
    ).toEqual([]);
  });
});
