import { beforeAll, describe, expect, it } from "vitest";

import { loadKeyedDictionary } from "../i18n";

import { HARDWARE_SCHEMA } from "./hardwareSchema";
import { parseProductImport } from "./parser";
import { buildProductView } from "./productView";

const FILE = `
schema_version=1
name=Nintendo Switch 2 Pro Controller
brand=Nintendo
model_number=HAC-013
bluetooth=true
bluetooth_version=5.3
battery_capacity=1300
product_weight=246
feature.1=عصي Hall Effect
highlight.1=زمن استجابة منخفض
pro.1=بناء متين
con.1=السعر مرتفع
compatibility.1.name=Nintendo Switch 2
compatibility.1.status=compatible
box_content.1.name=ذراع التحكم
box_content.1.quantity=1
gallery.1.image=https://example.com/a.jpg
video.1.title=Setup
video.1.url=https://example.com/v
video.1.type=setup
document.1.title=Manual
document.1.url=https://example.com/m.pdf
document.1.type=manual
faq.1.question=هل يعمل مع PC؟
faq.1.answer=نعم عبر Bluetooth.
source.1.name=Nintendo
source.1.url=https://www.nintendo.com/
source.1.type=manufacturer
option.1.id=black
option.1.name=أسود
spec_group.1.key=connectivity
spec_group.1.spec.1.key=hdmi
spec_group.1.spec.1.value=2.1
`;

function build(locale: "ar" | "en" | "tr") {
  const parsed = parseProductImport(FILE, HARDWARE_SCHEMA);
  return buildProductView(
    { ...parsed.data, id: "p1", category: "cat_hardware", price: 120000, originalPrice: 150000 },
    locale,
  );
}

// Spec labels resolve through the keyed dictionaries, and English and Turkish
// are fetched on demand in the app, so load them before asserting their copy.
beforeAll(async () => {
  await Promise.all([loadKeyedDictionary("en"), loadKeyedDictionary("tr")]);
});

describe("product view model", () => {
  it("turns schema scalars into localized spec tables without per-field UI code", () => {
    const view = build("en");
    expect(view).not.toBeNull();
    const labels = view!.specGroups.flatMap((g) => g.specs.map((s) => s.label));
    expect(labels).toContain("Bluetooth version");
    expect(labels).toContain("Battery capacity");

    const arabic = build("ar")!;
    const arLabels = arabic.specGroups.flatMap((g) => g.specs.map((s) => s.label));
    expect(arLabels).toContain("إصدار Bluetooth");

    const turkish = build("tr")!;
    const trLabels = turkish.specGroups.flatMap((g) => g.specs.map((s) => s.label));
    expect(trLabels).toContain("Bluetooth sürümü");
  });

  // The template's section headings are Arabic by design; the page must not
  // show localized rows sitting under an Arabic heading.
  it("localizes the spec group headings too, not just the rows", () => {
    expect(build("en")!.specGroups.map((g) => g.label)).toContain("Connectivity");
    expect(build("tr")!.specGroups.map((g) => g.label)).toContain("Bağlantı");
    expect(build("ar")!.specGroups.map((g) => g.label)).toContain("الاتصال");
  });

  it("appends dynamic spec groups from the import file", () => {
    const view = build("en")!;
    const connectivity = view.specGroups.find((g) => g.label === "Connectivity");
    expect(connectivity?.specs.some((s) => s.label === "HDMI" && s.value === "2.1")).toBe(true);
  });

  it("keeps units as international notation rather than translating them", () => {
    const view = build("tr")!;
    const weight = view.specGroups.flatMap((g) => g.specs).find((s) => s.label === "Ağırlık");
    expect(weight?.unit).toBe("g");
  });

  it("renders booleans as a localized yes and hides false ones", () => {
    const view = build("ar")!;
    const specs = view.specGroups.flatMap((g) => g.specs);
    expect(specs.find((s) => s.label === "Bluetooth")?.value).toBe("نعم");
    // `wifi` was never set, so it must not appear at all.
    expect(specs.some((s) => s.label === "Wi-Fi")).toBe(false);
  });

  it("derives the discount from price and original price", () => {
    const view = build("en")!;
    expect(view.price).toBe(120000);
    expect(view.originalPrice).toBe(150000);
    expect(view.discountPercent).toBe(20);
  });

  it("collects every list section", () => {
    const view = build("en")!;
    expect(view.features).toHaveLength(1);
    expect(view.highlights).toHaveLength(1);
    expect(view.pros).toHaveLength(1);
    expect(view.cons).toHaveLength(1);
    expect(view.compatibility[0]?.name).toBe("Nintendo Switch 2");
    expect(view.boxContents[0]?.quantity).toBe(1);
    expect(view.gallery).toHaveLength(1);
    expect(view.videos).toHaveLength(1);
    expect(view.documents).toHaveLength(1);
    expect(view.faq).toHaveLength(1);
    expect(view.sources).toHaveLength(1);
    expect(view.options[0]?.id).toBe("black");
  });

  it("leaves absent sections empty so the page can hide them entirely", () => {
    const minimal = buildProductView(
      { id: "p2", category: "cat_accessories", title: "Plain cable", price: 5000 },
      "en",
    );
    expect(minimal).not.toBeNull();
    expect(minimal!.features).toEqual([]);
    expect(minimal!.specGroups).toEqual([]);
    expect(minimal!.faq).toEqual([]);
    expect(minimal!.sources).toEqual([]);
    expect(minimal!.gameCompatibility).toEqual([]);
  });

  it("returns null for products that belong to another section", () => {
    expect(
      buildProductView({ id: "g1", category: "cat_nintendo", kind: "account" }, "ar"),
    ).toBeNull();
  });
});
