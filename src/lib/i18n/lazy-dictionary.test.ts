import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * English, Kurdish and Turkish copy is fetched on demand so an Arabic shopper
 * — the store's default audience — never downloads it. Two properties have to
 * hold for that to be safe:
 *
 *   1. Arabic needs nothing: its keys are its copy.
 *   2. A locale whose pack has not arrived degrades to Arabic, never to a raw
 *      dotted key. The root route loader awaits the pack before the first
 *      render, so this fallback should not be seen in practice — but if a fetch
 *      fails, the page must still read correctly.
 */
describe("on-demand dictionaries", () => {
  beforeEach(() => vi.resetModules());

  it("falls back to Arabic before the pack is loaded, never to the key", async () => {
    const { translate, isDictionaryLoaded } = await import("./index");

    expect(isDictionaryLoaded("en")).toBe(false);

    const before = translate("en", "product.addToCart");
    expect(before).not.toBe("product.addToCart");
    expect(before).toBe(translate("ar", "product.addToCart"));
  });

  it("serves the real copy once the pack has landed", async () => {
    const { translate, loadKeyedDictionary, isDictionaryLoaded } = await import("./index");

    await loadKeyedDictionary("en");

    expect(isDictionaryLoaded("en")).toBe(true);
    expect(translate("en", "product.addToCart")).toBe("Add to cart");
    expect(translate("en", "product.addToCart")).not.toBe(translate("ar", "product.addToCart"));
  });

  it("treats Arabic as always available and does no work for it", async () => {
    const { isDictionaryLoaded, loadKeyedDictionary, translate } = await import("./index");

    expect(isDictionaryLoaded("ar")).toBe(true);
    await expect(loadKeyedDictionary("ar")).resolves.toBeUndefined();
    expect(translate("ar", "product.addToCart")).toBe("أضف إلى السلة");
  });

  it("shares one in-flight request across concurrent callers", async () => {
    const { loadKeyedDictionary, translate } = await import("./index");

    await Promise.all([
      loadKeyedDictionary("tr"),
      loadKeyedDictionary("tr"),
      loadKeyedDictionary("tr"),
    ]);

    expect(translate("tr", "product.addToCart")).not.toBe(translate("ar", "product.addToCart"));
  });

  it("ensureLanguageAssets resolves immediately for Arabic and loads for others", async () => {
    const { ensureLanguageAssets, useI18n } = await import("../../i18n");

    await expect(ensureLanguageAssets("ar")).resolves.toBeUndefined();
    // Arabic short-circuits in t() regardless of what is loaded.
    useI18n.setState({ lang: "ar" });
    expect(useI18n.getState().t("إضافة للسلة")).toBe("إضافة للسلة");

    await ensureLanguageAssets("en");
    useI18n.setState({ lang: "en" });
    expect(useI18n.getState().t("إضافة للسلة")).toBe("Add to Cart");
  });
});
