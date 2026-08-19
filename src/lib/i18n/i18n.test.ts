import { describe, expect, it } from "vitest";

import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import { tr } from "./dictionaries/tr";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  detectBrowserLocale,
  dirOf,
  formatNumber,
  plural,
  translate,
} from "./index";
import {
  camelize,
  resolveSpecGroups,
  specGroupLabel,
  specLabel,
} from "../productImport/specLabels";

type Tree = Record<string, unknown>;

function paths(node: Tree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? paths(value as Tree, path) : [path];
  });
}

describe("dictionaries", () => {
  const arPaths = paths(ar as unknown as Tree).sort();

  it("keeps every locale key-for-key identical to Arabic", () => {
    expect(paths(en as unknown as Tree).sort()).toEqual(arPaths);
    expect(paths(tr as unknown as Tree).sort()).toEqual(arPaths);
  });

  it("has no blank strings in any locale", () => {
    for (const [name, dict] of [
      ["ar", ar],
      ["en", en],
      ["tr", tr],
    ] as const) {
      for (const path of paths(dict as unknown as Tree)) {
        const value = path.split(".").reduce<unknown>((acc, part) => (acc as Tree)?.[part], dict);
        expect(String(value).trim(), `${name}:${path}`).not.toBe("");
      }
    }
  });

  it("does not leave Arabic text sitting in the English or Turkish UI", () => {
    const arabic = /[؀-ۿ]/;
    for (const [name, dict] of [
      ["en", en],
      ["tr", tr],
    ] as const) {
      for (const path of paths(dict as unknown as Tree)) {
        const value = String(
          path.split(".").reduce<unknown>((acc, part) => (acc as Tree)?.[part], dict),
        );
        expect(arabic.test(value), `${name}:${path} → "${value}"`).toBe(false);
      }
    }
  });

  it("keeps Turkish-specific characters intact", () => {
    expect(tr.product.sections.specifications).toBe("Teknik özellikler");
    expect(tr.nav.login).toBe("Giriş yap");
    expect(tr.specs.bluetoothVersion).toBe("Bluetooth sürümü");
    expect(LOCALE_META.tr.label).toBe("Türkçe");
  });
});

describe("translate", () => {
  it("resolves a key in each language", () => {
    expect(translate("ar", "product.addToCart")).toBe("أضف إلى السلة");
    expect(translate("en", "product.addToCart")).toBe("Add to cart");
    expect(translate("tr", "product.addToCart")).toBe("Sepete ekle");
  });

  it("keeps context-sensitive words apart", () => {
    // "Order" the purchase vs. "order" the sort position.
    expect(translate("ar", "orders.title")).toBe("طلباتي");
    expect(translate("ar", "common.displayOrder")).toBe("ترتيب العرض");
  });

  it("interpolates variables", () => {
    expect(translate("en", "greeting.welcomeUser", { name: "Ali" })).toBe("Welcome, Ali");
    expect(translate("tr", "greeting.welcomeUser", { name: "Ali" })).toBe("Merhaba, Ali");
    expect(translate("ar", "greeting.welcomeUser", { name: "علي" })).toBe("مرحباً، علي");
  });

  it("falls back to Arabic, then to the key, rather than rendering blank", () => {
    expect(translate("en", "totally.missing.key")).toBe("totally.missing.key");
  });
});

describe("plural rules", () => {
  it("uses Arabic's dual and plural forms instead of gluing a number on", () => {
    expect(plural("ar", "counts.products", 0)).toBe("لا توجد منتجات");
    expect(plural("ar", "counts.products", 1)).toBe("منتج واحد");
    expect(plural("ar", "counts.products", 2)).toBe("منتجان");
    expect(plural("ar", "counts.products", 5)).toBe("5 منتجات");
    expect(plural("ar", "counts.products", 20)).toBe("20 منتجاً");
  });

  it("uses natural English plurals", () => {
    expect(plural("en", "counts.results", 0)).toBe("No results");
    expect(plural("en", "counts.results", 1)).toBe("1 result");
    expect(plural("en", "counts.results", 7)).toBe("7 results");
  });

  it("keeps the Turkish noun singular after a numeral", () => {
    expect(plural("tr", "counts.items", 0)).toBe("Öğe yok");
    expect(plural("tr", "counts.items", 1)).toBe("1 öğe");
    expect(plural("tr", "counts.items", 9)).toBe("9 öğe");
  });
});

describe("direction and locale resolution", () => {
  it("marks Arabic RTL and English/Turkish LTR", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(dirOf("tr")).toBe("ltr");
  });

  it("defaults to Arabic and covers the three supported locales", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(LOCALES).toEqual(["ar", "en", "tr"]);
  });

  it("maps browser languages, falling back to Arabic for anything else", () => {
    expect(detectBrowserLocale(["tr-TR", "en-US"])).toBe("tr");
    expect(detectBrowserLocale(["en-GB"])).toBe("en");
    expect(detectBrowserLocale(["ar-IQ"])).toBe("ar");
    expect(detectBrowserLocale(["de-DE", "fr"])).toBe("ar");
    expect(detectBrowserLocale([])).toBe("ar");
  });

  it("formats numbers with Latin digits in Arabic, as Iraqi storefronts do", () => {
    expect(formatNumber("ar", 1234)).toMatch(/1/);
    expect(formatNumber("en", 1234)).toBe("1,234");
  });
});

describe("dynamic specification labels", () => {
  it("converts template keys to dictionary keys", () => {
    expect(camelize("bluetooth_version")).toBe("bluetoothVersion");
    expect(camelize("package_weight")).toBe("packageWeight");
  });

  it("localizes a known spec from its stable key alone", () => {
    const spec = { key: "bluetooth_version", value: "5.3" };
    expect(specLabel("ar", spec)).toBe("إصدار Bluetooth");
    expect(specLabel("en", spec)).toBe("Bluetooth version");
    expect(specLabel("tr", spec)).toBe("Bluetooth sürümü");
  });

  it("localizes known group keys", () => {
    expect(specGroupLabel("ar", { key: "connectivity" })).toBe("الاتصال");
    expect(specGroupLabel("tr", { key: "connectivity" })).toBe("Bağlantı");
  });

  it("uses the admin's own label for a custom spec, per locale", () => {
    const custom = {
      key: "custom_thing",
      labelAr: "شيء مخصص",
      labelEn: "Custom thing",
      labelTr: "Özel şey",
    };
    expect(specLabel("ar", custom)).toBe("شيء مخصص");
    expect(specLabel("en", custom)).toBe("Custom thing");
    expect(specLabel("tr", custom)).toBe("Özel şey");
  });

  it("falls back to the original text rather than machine-translating", () => {
    const bare = { name: "Sonic Resonance Index" };
    expect(specLabel("ar", bare)).toBe("Sonic Resonance Index");
    expect(specLabel("tr", bare)).toBe("Sonic Resonance Index");
  });

  it("drops specs and groups that carry no value", () => {
    const groups = resolveSpecGroups("en", [
      { key: "power", specs: [{ key: "wattage", value: "" }] },
      { key: "connectivity", specs: [{ key: "hdmi", value: "2.1" }] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Connectivity");
  });
});
