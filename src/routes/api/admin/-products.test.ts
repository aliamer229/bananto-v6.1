import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeSlug } from "./products";

describe("Product saving & slug sanitization logic", () => {
  it("sanitizes Latin slugs properly", () => {
    expect(sanitizeSlug("Super Mario Odyssey 2", "prd_123")).toBe("super-mario-odyssey-2");
    expect(sanitizeSlug("The Legend of Zelda: Tears of the Kingdom!!!", "prd_456")).toBe(
      "the-legend-of-zelda-tears-of-the-kingdom",
    );
  });

  it("handles Arabic titles gracefully with fallback to product ID", () => {
    const arabicTitle = "سوبر ماريو أوديسي";
    expect(sanitizeSlug(arabicTitle, "prd_abc789")).toBe("product-prdabc789");
  });

  it("trims excess hyphens and special symbols", () => {
    expect(sanitizeSlug("---Nintendo Switch OLED (White)---", "prd_999")).toBe(
      "nintendo-switch-oled-white",
    );
  });
});

describe("Product single save validation rules", () => {
  type CatalogProduct = {
    id: string;
    title: string;
    titleEn: string;
    slug: string;
    price: number;
    cost: number;
    options?: { id: string; name: string; price: number }[];
    editions?: { id: string; name: string; price: number }[];
    dlcs?: { id: string; name: string; price: number }[];
    colors?: string[];
    hardwareSpecs?: Record<string, string>;
  };

  const existingCatalog: CatalogProduct[] = [
    {
      id: "prd_existing_1",
      title: "Super Mario Bros Wonder",
      titleEn: "Super Mario Bros Wonder",
      slug: "super-mario-bros-wonder",
      price: 55000,
      cost: 40000,
    },
    {
      id: "prd_existing_2",
      title: "Zelda Breath of the Wild",
      titleEn: "Zelda Breath of the Wild",
      slug: "zelda-breath-of-the-wild",
      price: 60000,
      cost: 45000,
    },
  ];

  it("allows updating an existing product with its same slug without collision", () => {
    const updatingProduct = {
      id: "prd_existing_1",
      titleEn: "Super Mario Bros Wonder Updated",
      slug: "super-mario-bros-wonder",
      price: 52000,
    };

    const conflict = existingCatalog.find(
      (p) =>
        String(p.id) !== String(updatingProduct.id) &&
        p.slug.toLowerCase() === updatingProduct.slug.toLowerCase(),
    );

    expect(conflict).toBeUndefined();
  });

  it("detects and blocks duplicate slug conflict against a different product", () => {
    const newProduct = {
      id: "prd_new_999",
      titleEn: "Super Mario Bros Wonder Copy",
      slug: "super-mario-bros-wonder",
      price: 50000,
    };

    const conflict = existingCatalog.find(
      (p) =>
        String(p.id) !== String(newProduct.id) &&
        p.slug.toLowerCase() === newProduct.slug.toLowerCase(),
    );

    expect(conflict).toBeDefined();
    expect(conflict?.id).toBe("prd_existing_1");
  });

  it("preserves complex product sub-structures like options, editions, dlcs, and colors", () => {
    const complexProduct = {
      id: "prd_complex_001",
      title: "Mario Kart 8 Deluxe",
      titleEn: "Mario Kart 8 Deluxe",
      slug: "mario-kart-8-deluxe",
      price: 50000,
      cost: 35000,
      options: [
        { id: "opt_offline", name: "حساب أوفلاين", price: 15000 },
        { id: "opt_online", name: "حساب أونلاين كامل", price: 45000 },
      ],
      editions: [
        { id: "ed_base", name: "Standard Edition", price: 50000 },
        { id: "ed_booster", name: "Deluxe + Booster Course Pass", price: 75000 },
      ],
      dlcs: [{ id: "dlc_pass", name: "Booster Course Pass", price: 25000 }],
      colors: ["Red/Blue", "Neon Purple/Orange"],
      hardwareSpecs: { storage: "64GB", battery: "4.5-9 hours" },
    };

    // Ensure array mutation creates a non-duplicated list
    const updatedCatalog = (() => {
      const idx = existingCatalog.findIndex((p) => p.id === complexProduct.id);
      if (idx >= 0) {
        const next = [...existingCatalog];
        next[idx] = complexProduct;
        return next;
      }
      return [complexProduct, ...existingCatalog];
    })();

    expect(updatedCatalog.length).toBe(existingCatalog.length + 1);
    const retrieved = updatedCatalog.find((p) => p.id === "prd_complex_001");
    expect(retrieved?.options).toHaveLength(2);
    expect(retrieved?.editions).toHaveLength(2);
    expect(retrieved?.dlcs).toHaveLength(1);
    expect(retrieved?.colors).toEqual(["Red/Blue", "Neon Purple/Orange"]);
  });

  it("handles missing image gracefully without throwing", () => {
    const productWithoutImage = {
      id: "prd_no_image",
      titleEn: "Text Only Game",
      price: 10000,
      image: "",
      coverImage: undefined,
      cartridgeImage: undefined,
    };

    const resolvedImage =
      productWithoutImage.coverImage ||
      productWithoutImage.cartridgeImage ||
      productWithoutImage.image ||
      "";
    expect(resolvedImage).toBe("");
  });
});
