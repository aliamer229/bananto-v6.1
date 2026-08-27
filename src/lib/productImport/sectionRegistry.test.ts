import { describe, expect, it } from "vitest";

import { buildProductView } from "./productView";
import { parseProductImport } from "./parser";
import { navSections, PRODUCT_SECTIONS, resolveSections } from "./sectionRegistry";
import { AMIIBO_SCHEMA } from "./amiiboSchema";
import { BUNDLE_SCHEMA } from "./bundleSchema";
import { GIFT_CARD_SCHEMA } from "./giftCardSchema";
import { USED_SCHEMA } from "./usedSchema";
import type { ProductSchema } from "./types";

function viewOf(file: string, schema: ProductSchema) {
  const parsed = parseProductImport(file, schema);
  const view = buildProductView(parsed.data, "ar", schema);
  if (!view) throw new Error("no view");
  return view;
}

const ids = (file: string, schema: ProductSchema) =>
  resolveSections(viewOf(file, schema)).map((section) => section.id);

describe("resolveSections", () => {
  it("gives a bare product only the sections it has data for", () => {
    const sections = ids("schema_version=2\nname=Something\n", GIFT_CARD_SCHEMA);
    // No description, no gallery, no FAQ, no sources — none of them appear.
    expect(sections).not.toContain("overview");
    expect(sections).not.toContain("gallery");
    expect(sections).not.toContain("faq");
    expect(sections).not.toContain("sources");
  });

  it("leads a used item with its condition, not with an overview", () => {
    const sections = ids(
      [
        "schema_version=2",
        "name=Nintendo Switch OLED (مستعمل)",
        "used_type=console",
        "condition_grade=very_good",
        "condition_notes<<EOF",
        "خدوش خفيفة على الظهر.",
        "EOF",
        "tested=true",
        "tested_at=2026-03-04",
        "inspection_point.1=تشغيل الجهاز",
        "inspection_point.2=فحص البطارية",
        "description_ar<<EOF",
        "جهاز مفحوص بالكامل.",
        "EOF",
      ].join("\n"),
      USED_SCHEMA,
    );
    // No brand/model/SKU on this fixture, so there is no "Key facts" table and
    // the page opens on the thing a second-hand buyer actually reads first.
    expect(sections[0]).toBe("condition");
    expect(sections).not.toContain("keyFacts");
    expect(sections.indexOf("condition")).toBeLessThan(sections.indexOf("overview"));
    expect(sections).toContain("inspection");
  });

  it("never offers a used section to a gift card, or a card section to a used item", () => {
    const card = ids(
      "schema_version=2\nname=eShop\ncard_type=eshop\ncard_region=US\nvalidity=no_expiry\n",
      GIFT_CARD_SCHEMA,
    );
    expect(card).toContain("cardDetails");
    expect(card).not.toContain("condition");
    expect(card).not.toContain("bundleContents");

    const used = ids(
      "schema_version=2\nname=Used\nused_type=cartridge\ncondition_grade=good\n",
      USED_SCHEMA,
    );
    expect(used).not.toContain("cardDetails");
  });

  it("keeps a bundle's contents but drops them when the bundle lists nothing", () => {
    const withItems = ids(
      [
        "schema_version=2",
        "name=Mario Bundle",
        "account_type=primary",
        "bundle_item.1.title=Super Mario Odyssey",
        "bundle_item.1.value_iqd=45000",
        // Well past the eight rows the template prints as examples.
        "bundle_item.14.title=Mario Kart 8 Deluxe",
      ].join("\n"),
      BUNDLE_SCHEMA,
    );
    expect(withItems).toContain("bundleContents");

    const withoutItems = ids("schema_version=2\nname=Empty Bundle\n", BUNDLE_SCHEMA);
    expect(withoutItems).not.toContain("bundleContents");
  });

  it("renders an amiibo's per-game table instead of a generic compatibility list", () => {
    const sections = ids(
      [
        "schema_version=2",
        "name=Link amiibo",
        "character=Link",
        "game_compatibility.1.game=The Legend of Zelda: Tears of the Kingdom",
        "game_compatibility.1.function=استدعاء عناصر",
        "game_compatibility.9.game=Super Smash Bros. Ultimate",
      ].join("\n"),
      AMIIBO_SCHEMA,
    );
    expect(sections).toContain("gameCompatibility");
    // amiibo shows its measurements under "Figure details", never twice.
    expect(sections).not.toContain("specs");
  });

  it("lists in the nav only sections that were actually rendered", () => {
    const view = viewOf(
      "schema_version=2\nname=eShop\ncard_type=eshop\ncard_region=US\nfaq.1.question=س\nfaq.1.answer=ج\n",
      GIFT_CARD_SCHEMA,
    );
    const sections = resolveSections(view);
    const nav = navSections(sections);
    const rendered = new Set(sections.map((s) => s.id));
    for (const item of nav) expect(rendered.has(item.id)).toBe(true);
  });

  it("orders every section deterministically", () => {
    const orders = PRODUCT_SECTIONS.map((s) => s.order);
    expect(orders.every((order) => Number.isFinite(order))).toBe(true);
    const view = viewOf(
      "schema_version=2\nname=x\nused_type=console\ncondition_grade=good\nfaq.1.question=a\nfaq.1.answer=b\nsource.1.url=https://nintendo.com\n",
      USED_SCHEMA,
    );
    const resolved = resolveSections(view).map((s) => s.order);
    expect([...resolved].sort((a, b) => a - b)).toEqual(resolved);
  });
});
