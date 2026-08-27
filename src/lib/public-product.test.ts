import { describe, expect, it } from "vitest";

import { toPublicProduct } from "./public-product.server";
import { customerSafeText, looksLikeInternalNote } from "./internalMetadata";

/**
 * The exact string a customer was shown on the product page, next to the price,
 * in the editions comparison.
 *
 * It reached them because `type.N.description` sat under `type.N.cost` in the
 * import template with no guidance about who it was for, and `buildEditions`
 * promotes a variant description with no `contents` into a comparison row.
 */
const LEAKED =
  "Supplier Regular / 普通版 converted to IQD using 1 CNY = 220 IQD and rounded down to nearest 250 IQD";
const LEAKED_STANDARD =
  "Supplier Standard / 标准版 converted to IQD using 1 CNY = 220 IQD and rounded down to nearest 250 IQD";

/** What the customer is supposed to read instead. */
const SAFE_AR = "مخصص للاستخدام أوفلاين";
const SAFE_EN = "Supports online play depending on account terms";

const product = {
  id: "prd_1",
  slug: "fatal-frame-ii",
  title: "FATAL FRAME II: Crimson Butterfly REMAKE",
  price: 22000,
  cost: 4000,
  supplierId: "sup_88",
  types: [
    {
      id: "standard_offline",
      name: "Standard Offline",
      price: 9000,
      cost: 1500,
      description: LEAKED,
    },
    {
      id: "standard_online",
      name: "Standard Online",
      price: 22000,
      cost: 4000,
      description: LEAKED_STANDARD,
    },
  ],
  options: [
    { id: "offline_account", name: "حساب أوفلاين", description: SAFE_AR, internalNote: LEAKED },
  ],
};

const serialised = () => JSON.stringify(toPublicProduct(product));

describe("the supplier rule never reaches a customer", () => {
  it("strips the exact string that was on the product page", () => {
    expect(serialised()).not.toContain("Supplier");
    expect(serialised()).not.toContain("220 IQD");
    expect(serialised()).not.toContain("普通版");
    expect(serialised()).not.toContain("标准版");
    expect(serialised()).not.toContain("converted");
    expect(serialised()).not.toContain("rounded down");
  });

  it("replaces the polluted description with the standardized customer description", () => {
    const out = toPublicProduct(product);
    const types = out["types"] as Record<string, unknown>[];
    expect(types[0]!["description"]).toBe("اللعبة الأساسية");
    expect(types[1]!["description"]).toBe("اللعبة الأساسية");
  });

  it("keeps everything the customer legitimately needs", () => {
    const out = toPublicProduct(product);
    const types = out["types"] as Record<string, unknown>[];
    expect(types[0]!["name"]).toBe("Standard Offline");
    expect(types[0]!["price"]).toBe(9000);
    expect(types[1]!["name"]).toBe("Standard Online");
    expect(types[1]!["price"]).toBe(22000);
    expect(out["title"]).toBe("FATAL FRAME II: Crimson Butterfly REMAKE");
  });

  it("standardizes customer option descriptions to unified rules", () => {
    const out = toPublicProduct(product);
    const options = out["options"] as Record<string, unknown>[];
    expect(options[0]!["description"]).toBe("حساب مشترك");
  });

  it("drops the dedicated internal note field wherever it appears", () => {
    const out = toPublicProduct(product);
    const options = out["options"] as Record<string, unknown>[];
    expect(options[0]).not.toHaveProperty("internalNote");
  });
});

describe("cost and supplier data never leave the server", () => {
  it("removes product cost and supplier id", () => {
    const out = toPublicProduct(product);
    expect(out).not.toHaveProperty("cost");
    expect(out).not.toHaveProperty("supplierId");
  });

  it("removes per-variant cost, which is the margin on every line", () => {
    const out = toPublicProduct(product);
    for (const row of out["types"] as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("cost");
    }
    expect(serialised()).not.toContain("1500");
  });

  it("removes private keys at any depth", () => {
    const deep = toPublicProduct({
      id: "x",
      meta: { nested: { supplierCost: 999, apiKey: "secret", wholesale_price: 5 } },
    });
    const text = JSON.stringify(deep);
    expect(text).not.toContain("999");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("wholesale");
  });
});

describe("edition content rows are checked too", () => {
  it("removes a content row whose label is internal bookkeeping", () => {
    const out = toPublicProduct({
      id: "x",
      editions: [
        {
          id: "std",
          name: "Standard",
          contents: [{ id: "c1", label: LEAKED }, { id: "c2", label: "يشمل اللعبة الأساسية" }],
        },
      ],
    });
    const contents = (out["editions"] as Record<string, unknown>[])[0]!["contents"] as Record<
      string,
      unknown
    >[];
    expect(contents).toHaveLength(1);
    expect(contents[0]!["label"]).toBe("يشمل اللعبة الأساسية");
  });
});

describe("the detector is specific, not a blanket filter", () => {
  it("recognises supplier and conversion vocabulary", () => {
    for (const text of [
      LEAKED,
      LEAKED_STANDARD,
      "Supplier Deluxe / 豪华版",
      "1 CNY = 220 IQD",
      "rounded down to nearest 250",
      "converted to IQD at the daily exchange rate",
      "ملاحظة داخلية: سعر المورّد",
    ]) {
      expect(looksLikeInternalNote(text), `should be internal: ${text}`).toBe(true);
    }
  });

  it("leaves real customer copy alone", () => {
    for (const text of [
      SAFE_AR,
      SAFE_EN,
      "النسخة القياسية من اللعبة",
      "Includes the base game and the season pass",
      "يدعم اللعب المحلي حتى 4 لاعبين",
      "Standard Online",
      "Standard Offline",
      "Digital deluxe edition with soundtrack",
    ]) {
      expect(looksLikeInternalNote(text), `should be safe: ${text}`).toBe(false);
      expect(customerSafeText(text)).toBe(text);
    }
  });

  it("treats empty and non-string values as simply absent", () => {
    expect(looksLikeInternalNote("")).toBe(false);
    expect(looksLikeInternalNote("   ")).toBe(false);
    expect(looksLikeInternalNote(null)).toBe(false);
    expect(looksLikeInternalNote(42)).toBe(false);
    expect(customerSafeText("  ")).toBeUndefined();
    expect(customerSafeText(undefined)).toBeUndefined();
  });
});

/**
 * The serializer and the renderer that printed the leak, together.
 *
 * `toPublicProduct` being correct in isolation is not the claim that matters.
 * The claim is that the sentence cannot reach the editions comparison, and that
 * runs through `buildEditions`, which promotes a variant description with no
 * `contents` into a customer-visible row — the exact mechanism that put the
 * supplier's cost formula next to the price on the product page.
 *
 * This drives the real renderer over the real serializer's output.
 */
describe("the leak cannot survive the round trip to the rendered page", () => {
  it("produces no edition row carrying the supplier rule", async () => {
    const { gameFromProduct } = await import("@/hub/data/fromProduct");

    const polluted = {
      id: "prd_ff2",
      slug: "fatal-frame-ii",
      title: "FATAL FRAME II",
      titleEn: "FATAL FRAME II: Crimson Butterfly REMAKE",
      price: 22000,
      cost: 4000,
      types: [
        { id: "std_off", name: "Standard Offline", price: 9000, cost: 1500, description: LEAKED },
        {
          id: "std_on",
          name: "Standard Online",
          price: 22000,
          cost: 4000,
          description: LEAKED_STANDARD,
        },
      ],
    };

    const game = gameFromProduct(
      toPublicProduct(polluted) as Record<string, unknown>,
      { locale: "ar" } as never,
    );
    const rendered = JSON.stringify(game);

    for (const fragment of ["Supplier", "220 IQD", "普通版", "标准版", "converted", "rounded down"]) {
      expect(rendered, `leaked: ${fragment}`).not.toContain(fragment);
    }

    // And the editions are still there — stripping must not empty the section.
    const names = (game.editions ?? []).map((e) => e.name);
    expect(names).toContain("Standard Offline");
    expect(names).toContain("Standard Online");

    /*
      Proof the assertions above are not vacuous: the same renderer over the
      *unsanitized* row does print the sentence, as a row of the comparison.
      Without this, a serializer that dropped `types` entirely would pass every
      check above while quietly deleting the section.
    */
    const unsanitized = JSON.stringify(
      gameFromProduct(polluted as Record<string, unknown>, { locale: "ar" } as never),
    );
    expect(unsanitized).toContain("Supplier");
    expect(unsanitized).toContain("220 IQD");
  });

  it("still renders a genuine customer description as an edition row", async () => {
    const { gameFromProduct } = await import("@/hub/data/fromProduct");
    const clean = {
      id: "prd_ok",
      slug: "ok",
      title: "لعبة",
      price: 9000,
      types: [{ id: "off", name: "أوفلاين", price: 9000, description: SAFE_AR }],
    };
    const game = gameFromProduct(
      toPublicProduct(clean) as Record<string, unknown>,
      { locale: "ar" } as never,
    );
    expect(JSON.stringify(game)).toContain(SAFE_AR);
  });
});
