/**
 * Turns a stored product record into a render-ready, already-localized view
 * model for the details page.
 *
 * Two things happen here that the page itself should not have to care about:
 *
 *  1. **Scalar fields become spec tables.** Every schema field carries a
 *     `group` (its template heading) and a `specKey` (its i18n key), so
 *     `bluetoothVersion: "5.3"` lands in the Connectivity table as
 *     "Bluetooth Sürümü — 5.3" with no per-field UI code. Dynamic
 *     `spec_group` entries from the import file are appended to the same list,
 *     which is why a brand new specification needs no code change at all.
 *
 *  2. **Empty things disappear.** Anything without data is dropped here rather
 *     than being handed to the page as an empty array, so a section that has
 *     nothing to say simply does not exist.
 */

import { translate, type Locale } from "../i18n";
import { toAmount } from "../purchasable";
import { getTextValue } from "../utils";
import { detectSchema } from "./registry";
import { SPEC_GROUP_KEYS } from "./shared";
import { resolveSpecGroups, type ResolvedSpecGroup } from "./specLabels";
import type { FieldDef, ProductSchema } from "./types";

type Record_ = Record<string, unknown>;

const str = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    return getTextValue(v).trim();
  }
  return v == null ? "" : String(v).trim();
};
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter(Boolean) : []);

export interface MediaItem {
  url: string;
  title?: string;
  description?: string;
}

export interface VideoItem {
  url: string;
  title?: string;
  thumbnail?: string;
  type?: string;
}

export interface DocumentItem {
  url: string;
  title?: string;
  type?: string;
}

export interface CompatibilityItem {
  name: string;
  status?: string;
  notes?: string;
  url?: string;
  productId?: string;
}

export interface GameCompatibilityItem {
  game: string;
  platform?: string;
  function?: string;
  reward?: string;
  description?: string;
  sourceUrl?: string;
}

export interface BoxContentItem {
  name: string;
  quantity?: number;
  image?: string;
  notes?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SourceItem {
  name: string;
  url: string;
  type?: string;
}

export interface UpdateItem {
  version?: string;
  date?: string;
  title?: string;
  changes?: string;
  url?: string;
}

export interface ExternalReviewItem {
  source: string;
  score?: string;
  quote?: string;
  url?: string;
}

export interface OptionItem {
  id: string;
  name: string;
  price?: number;
  cost?: number;
  stock?: number;
  image?: string;
  description?: string;
}

export interface VariantItem {
  name: string;
  optionId?: string;
  price?: number;
  cost?: number;
  stock?: number;
  color?: string;
  image?: string;
  sku?: string;
  description?: string;
}

export interface ProductView {
  schema: ProductSchema;
  title: string;
  subtitle: string;
  brand: string;
  model: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  stock: number;
  isInfiniteStock: boolean;
  availability: string;
  images: string[];
  descriptionShort: string;
  descriptionFull: string;
  overview: string;
  identity: { label: string; value: string }[];
  features: string[];
  highlights: string[];
  pros: string[];
  cons: string[];
  specGroups: ResolvedSpecGroup[];
  compatibility: CompatibilityItem[];
  gameCompatibility: GameCompatibilityItem[];
  boxContents: BoxContentItem[];
  gallery: MediaItem[];
  videos: VideoItem[];
  documents: DocumentItem[];
  faq: FaqItem[];
  sources: SourceItem[];
  updates: UpdateItem[];
  externalReviews: ExternalReviewItem[];
  options: OptionItem[];
  variants: VariantItem[];
  /** Redemption / setup steps rendered as a numbered list (gift cards, bundles…). */
  usageSteps: string[];
  usageUrl: string;
  usageTerms: string;
  warranty: { label: string; value: string }[];
  seo: { title: string; description: string; image: string };
}

/** Fields that belong in the identity strip under the title, not a spec table. */
const IDENTITY_FIELDS: { target: string; key: string }[] = [
  { target: "brand", key: "product.brand" },
  { target: "manufacturer", key: "product.manufacturer" },
  { target: "model", key: "product.model" },
  { target: "modelNumber", key: "product.modelNumber" },
  { target: "sku", key: "product.sku" },
  { target: "partNumber", key: "product.partNumber" },
  { target: "releaseDate", key: "product.releaseDate" },
  { target: "region", key: "product.region" },
  { target: "countryOfOrigin", key: "product.countryOfOrigin" },
];

const IMAGE_FIELDS = [
  "mainImage",
  "coverImage",
  "frontImage",
  "backImage",
  "leftImage",
  "rightImage",
  "closeUpImage",
  "packagingFrontImage",
  "packagingBackImage",
  "listingImage",
  "bannerImage",
  "thumbnailImage",
];

export function buildProductView(
  productInput: Record_,
  locale: Locale,
  schemaInput?: ProductSchema,
): ProductView | null {
  const schema = schemaInput ?? detectSchema(productInput);
  if (!schema) return null;

  const p = productInput;
  const t = (key: string) => translate(locale, key);

  /* ------------------------------ spec tables ------------------------------ */

  // Scalar schema fields carrying a `specKey`, bucketed by their template group.
  const buckets = new Map<
    string,
    { label: string; specs: { label: string; value: string; unit?: string }[] }
  >();

  const pushSpec = (def: FieldDef, rawValue: unknown) => {
    const value = formatValue(rawValue, locale, t);
    if (!value) return;
    const groupName = def.group ?? "";
    let bucket = buckets.get(groupName);
    if (!bucket) {
      // The template heading is Arabic by design; render its localized name.
      const groupKey = SPEC_GROUP_KEYS[groupName];
      bucket = { label: groupKey ? t(`specs.groups.${groupKey}`) : groupName, specs: [] };
      buckets.set(groupName, bucket);
    }
    const entry: { label: string; value: string; unit?: string } = {
      label: def.specKey ? t(`specs.${def.specKey}`) : def.key,
      value,
    };
    if (def.unit) entry.unit = def.unit;
    bucket.specs.push(entry);
  };

  for (const def of schema.fields) {
    if (!def.specKey || def.type === "group" || def.repeatable) continue;
    if (IDENTITY_FIELDS.some((f) => f.target === def.target)) continue;
    pushSpec(def, p[def.target]);
  }

  const scalarGroups: ResolvedSpecGroup[] = [...buckets.values()]
    .filter((b) => b.specs.length > 0)
    .map((b) => ({ label: b.label, specs: b.specs }));

  const dynamicGroups = resolveSpecGroups(locale, p["specGroups"] as never);

  // A schema field and a dynamic group can resolve to the same heading (both
  // "Connectivity", say). Rendering that twice looks like a bug, so same-named
  // groups are folded into one table, schema rows first.
  const mergedGroups: ResolvedSpecGroup[] = [];
  for (const group of [...scalarGroups, ...dynamicGroups]) {
    const existing = mergedGroups.find((g) => g.label === group.label);
    if (existing) existing.specs.push(...group.specs);
    else mergedGroups.push({ label: group.label, specs: [...group.specs] });
  }

  /* -------------------------------- assembly -------------------------------- */

  const images = [
    ...IMAGE_FIELDS.map((k) => str(p[k])),
    ...list<string>(p["lifestyleImages"]).map(str),
    ...list<{ url?: string }>(p["gallery"]).map((g) => str(g?.url)),
    str(p["image"]),
    ...list<string>(p["bannerImages"]).map(str),
  ].filter((url, index, all) => url && all.indexOf(url) === index);

  const identity = IDENTITY_FIELDS.map((field) => ({
    label: t(field.key),
    value: str(p[field.target]),
  })).filter((row) => row.value);

  const warranty = [
    { label: t("product.warranty"), value: str(p["warranty"]) },
    { label: t("common.type"), value: str(p["warrantyType"]) },
    { label: t("common.notes"), value: str(p["warrantyNotes"]) },
    { label: t("specs.certifications"), value: str(p["certifications"]) },
  ].filter((row) => row.value);

  const price = toAmount(p["price"]);
  const originalPrice = toAmount(p["originalPrice"]);
  const declaredDiscount = toAmount(p["discountPercent"]);
  const discountPercent =
    declaredDiscount > 0
      ? declaredDiscount
      : originalPrice > price && originalPrice > 0
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0;

  return {
    schema,
    title: str(p["titleEn"]) || str(p["english_name"]) || str(p["title"]) || str(p["name"]),
    subtitle: str(p["shortName"]) || str(p["tagline"]),
    brand: str(p["brand"]),
    model: str(p["model"]),
    price,
    originalPrice,
    discountPercent,
    stock: Number(p["stock"]) || 0,
    isInfiniteStock: p["isInfiniteStock"] === true,
    availability: str(p["availabilityStatus"]),
    images,
    descriptionShort: str(p["description_short"]),
    descriptionFull: str(p["description"]) || str(p["description_ar"]),
    overview: str(p["overview"]),
    identity,
    features: list<unknown>(p["features"]).map(getTextValue).filter(Boolean),
    highlights: [
      ...list<unknown>(p["highlights"]).map(getTextValue),
      ...list<unknown>(p["sellingPoints"]).map(getTextValue),
    ].filter(Boolean),
    pros: list<unknown>(p["pros"]).map(getTextValue).filter(Boolean),
    cons: list<unknown>(p["cons"]).map(getTextValue).filter(Boolean),
    specGroups: mergedGroups,
    compatibility: list<Record_>(p["compatibility"])
      .map((c) => {
        const item: CompatibilityItem = {
          name: str(c["name"]) || str(c["product"]) || str(c["model"]),
        };
        if (c["status"]) item.status = str(c["status"]);
        if (c["notes"]) item.notes = str(c["notes"]);
        if (c["url"]) item.url = str(c["url"]);
        if (c["productId"]) item.productId = str(c["productId"]);
        return item;
      })
      .filter((c) => c.name),
    gameCompatibility: list<Record_>(p["gameCompatibility"])
      .map((g) => {
        const item: GameCompatibilityItem = { game: str(g["game"]) };
        if (g["platform"]) item.platform = str(g["platform"]);
        if (g["function"]) item.function = str(g["function"]);
        if (g["reward"]) item.reward = str(g["reward"]);
        if (g["description"]) item.description = str(g["description"]);
        if (g["sourceUrl"]) item.sourceUrl = str(g["sourceUrl"]);
        return item;
      })
      .filter((g) => g.game),
    boxContents: list<Record_>(p["boxContents"])
      .map((b) => {
        const item: BoxContentItem = { name: str(b["name"]) };
        const qty = Number(b["quantity"]);
        if (Number.isFinite(qty) && qty > 0) item.quantity = qty;
        if (b["image"]) item.image = str(b["image"]);
        if (b["notes"]) item.notes = str(b["notes"]);
        return item;
      })
      .filter((b) => b.name),
    gallery: list<Record_>(p["gallery"])
      .map((g) => {
        const item: MediaItem = { url: str(g["url"]) };
        if (g["title"]) item.title = str(g["title"]);
        if (g["description"]) item.description = str(g["description"]);
        return item;
      })
      .filter((g) => g.url),
    videos: list<Record_>(p["videos"])
      .map((v) => {
        const item: VideoItem = { url: str(v["url"]) };
        if (v["title"]) item.title = str(v["title"]);
        if (v["thumbnail"]) item.thumbnail = str(v["thumbnail"]);
        if (v["type"]) item.type = str(v["type"]);
        return item;
      })
      .filter((v) => v.url),
    documents: list<Record_>(p["documents"])
      .map((d) => {
        const item: DocumentItem = { url: str(d["url"]) };
        if (d["title"]) item.title = str(d["title"]);
        if (d["type"]) item.type = str(d["type"]);
        return item;
      })
      .filter((d) => d.url),
    faq: list<Record_>(p["faq"])
      .map((q) => ({ question: str(q["question"]), answer: str(q["answer"]) }))
      .filter((q) => q.question && q.answer),
    sources: list<Record_>(p["sources"])
      .map((s) => {
        const item: SourceItem = { name: str(s["name"]) || str(s["url"]), url: str(s["url"]) };
        if (s["type"]) item.type = str(s["type"]);
        return item;
      })
      .filter((s) => s.url),
    updates: list<Record_>(p["firmwareUpdates"])
      .map((u) => {
        const item: UpdateItem = {};
        if (u["version"]) item.version = str(u["version"]);
        if (u["date"]) item.date = str(u["date"]);
        if (u["title"]) item.title = str(u["title"]);
        if (u["changes"]) item.changes = str(u["changes"]);
        if (u["url"]) item.url = str(u["url"]);
        return item;
      })
      .filter((u) => u.version || u.title || u.changes),
    externalReviews: list<Record_>(p["externalReviews"])
      .map((r) => {
        const item: ExternalReviewItem = { source: str(r["source"]) };
        if (r["score"]) item.score = str(r["score"]);
        if (r["quote"]) item.quote = str(r["quote"]);
        if (r["url"]) item.url = str(r["url"]);
        return item;
      })
      .filter((r) => r.source),
    usageSteps: toSteps(p["redemptionSteps"] ?? p["redeemSteps"] ?? p["setupSteps"]).length
      ? toSteps(p["redemptionSteps"] ?? p["redeemSteps"] ?? p["setupSteps"])
      : toSteps(p["redemptionGuide"] ?? p["activationGuide"] ?? p["usageGuide"]),
    usageUrl: str(p["redemptionUrl"] ?? ""),
    usageTerms: str(p["usageTerms"] ?? ""),
    options: list<Record_>(p["options"])
      .map((o, index) => {
        const item: OptionItem = {
          id: str(o["id"]) || `option-${index + 1}`,
          name: str(o["name"]),
        };
        if (o["price"] != null && str(o["price"]) !== "") {
          const amt = toAmount(o["price"]);
          if (amt > 0 || o["price"] === 0 || o["price"] === "0") item.price = amt;
        }
        if (o["cost"] != null && str(o["cost"]) !== "") {
          const amt = toAmount(o["cost"]);
          if (amt > 0 || o["cost"] === 0 || o["cost"] === "0") item.cost = amt;
        }
        if (o["stock"] != null) item.stock = Number(o["stock"]) || 0;
        if (o["image"]) item.image = str(o["image"]);
        if (o["description"]) item.description = str(o["description"]);
        return item;
      })
      .filter((o) => o.name),
    variants: (list<Record_>(p["variants"]).length > 0
      ? list<Record_>(p["variants"])
      : list<Record_>(p["types"])
    )
      .map((v) => {
        const item: VariantItem = { name: str(v["name"]) };
        const optId = str(v["optionId"] || v["option_id"]);
        if (optId && optId !== "all") item.optionId = optId;
        if (v["price"] != null && str(v["price"]) !== "") {
          const amt = toAmount(v["price"]);
          if (amt > 0 || v["price"] === 0 || v["price"] === "0") item.price = amt;
        }
        if (v["cost"] != null && str(v["cost"]) !== "") {
          const amt = toAmount(v["cost"]);
          if (amt > 0 || v["cost"] === 0 || v["cost"] === "0") item.cost = amt;
        }
        if (v["stock"] != null) item.stock = Number(v["stock"]) || 0;
        if (v["color"]) item.color = str(v["color"]);
        if (v["image"]) item.image = str(v["image"]);
        if (v["sku"]) item.sku = str(v["sku"]);
        if (v["description"]) item.description = str(v["description"]);
        return item;
      })
      .filter((v) => v.name),
    warranty,
    seo: {
      title: str(p["seoTitle"]) || str(p["title"]),
      description: str(p["seoDescription"]) || str(p["description_short"]),
      image: str(p["ogImage"]) || str(p["mainImage"]) || str(p["coverImage"]),
    },
  };
}

/**
 * Steps arrive either as a list or as one blob of text; both become an array of
 * clean lines so the page can always number them.
 */
function toSteps(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return raw
    .flatMap((entry) => {
      if (entry && typeof entry === "object") {
        const rec = entry as Record_;
        return [String(rec["value"] ?? rec["text"] ?? rec["title"] ?? rec["name"] ?? "")];
      }
      return String(entry ?? "").split(/\r?\n|\s*[>›»]\s*|\s*\u2190\s*/);
    })
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

/** Booleans become localized yes/no; everything else is passed through as text. */
function formatValue(value: unknown, _locale: Locale, t: (key: string) => string): string {
  if (value === true) return t("common.yes");
  if (value === false) return "";
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}
