/**
 * Which store section a product belongs to.
 *
 * One resolver, used by both the admin editor (to switch the add/edit form and
 * its required fields) and the storefront (to pick the details page). Nintendo
 * Switch Games is the only section that renders the Game Hub; every other
 * section has its own schema-driven details page.
 */

import { getSchema, type ProductSchemaId } from "./productImport/registry";
import type { ProductSchema } from "./productImport/types";

export type CategoryType =
  "game" | "hardware" | "amiibo" | "accessory" | "gift_card" | "used" | "bundle";

export function resolveCategoryType(
  categoryId?: string,
  categoryTitle?: string,
  kind?: string,
  schemaId?: string,
): CategoryType {
  const sid = String(schemaId || "").toLowerCase();
  if (sid === "hardware") return "hardware";
  if (sid === "amiibo") return "amiibo";
  if (sid === "accessory") return "accessory";
  if (sid === "gift_card") return "gift_card";
  if (sid === "used") return "used";
  if (sid === "bundle") return "bundle";

  const cid = String(categoryId || "").toLowerCase();
  const title = String(categoryTitle || "").toLowerCase();
  const k = String(kind || "").toLowerCase();

  if (cid.includes("bundle") || title.includes("بندل") || title.includes("حزم") || k === "bundle") {
    return "bundle";
  }
  if (
    cid.includes("hardware") ||
    cid.includes("device") ||
    cid.includes("console") ||
    title.includes("هاردوير") ||
    title.includes("أجهزة") ||
    title.includes("اجهزة") ||
    k === "hardware" ||
    k === "device"
  ) {
    return "hardware";
  }
  if (
    cid.includes("amiibo") ||
    cid.includes("figur") ||
    cid.includes("collectible") ||
    title.includes("مجسم") ||
    title.includes("اميبو") ||
    title.includes("amiibo") ||
    k === "collectible" ||
    k === "amiibo"
  ) {
    return "amiibo";
  }
  if (
    cid.includes("accessor") ||
    title.includes("إكسسوار") ||
    title.includes("اكسسوار") ||
    title.includes("ملحق") ||
    k === "accessory"
  ) {
    return "accessory";
  }
  if (
    cid.includes("card") ||
    cid.includes("gift") ||
    cid.includes("eshop") ||
    title.includes("كروت") ||
    title.includes("بطاق") ||
    title.includes("تعبئ") ||
    title.includes("شحن") ||
    k === "digital_code"
  ) {
    return "gift_card";
  }
  if (
    cid.includes("used") ||
    cid.includes("preowned") ||
    cid.includes("trade") ||
    title.includes("مستعمل") ||
    title.includes("مستخدم") ||
    title.includes("مستعملة") ||
    k === "used"
  ) {
    return "used";
  }

  return "game";
}

/**
 * Robust product classifier that checks schema, category, kind, and title hints.
 */
export function getProductCategory(product: unknown): CategoryType {
  if (!product || typeof product !== "object") return "game";
  const p = product as Record<string, any>;

  // 1. Direct schema check
  const schemaId = p.schemaId || p.schema?.id || p.schema_id;
  if (schemaId) {
    const resolved = resolveCategoryType("", "", "", String(schemaId));
    if (resolved !== "game") return resolved;
  }

  // 2. Kind check
  const kind = String(p.kind || "").toLowerCase();
  if (kind === "hardware" || kind === "device") return "hardware";
  if (kind === "accessory") return "accessory";
  if (kind === "amiibo" || kind === "collectible") return "amiibo";
  if (kind === "bundle") return "bundle";
  if (kind === "digital_code" || kind === "gift_card") return "gift_card";
  if (kind === "used") return "used";

  // 3. Category / CategoryId check
  const categoryId = String(p.category || p.categoryId || p.category_id || "").toLowerCase();
  const categoryTitle = String(p.categoryTitle || p.category_title || "").toLowerCase();

  const fromCategory = resolveCategoryType(categoryId, categoryTitle, kind);
  if (fromCategory !== "game") return fromCategory;

  // 4. Hardware title hints (e.g. Nintendo Switch 2 console, OLED model)
  const title = String(p.title || p.titleEn || p.english_name || "").toLowerCase();
  if (
    title.includes("switch 2 console") ||
    title.includes("switch oled console") ||
    title.includes("switch lite console") ||
    title.includes("dock set") ||
    title.includes("joy-con pair") ||
    title.includes("pro controller")
  ) {
    if (title.includes("controller") || title.includes("joy-con") || title.includes("dock")) {
      return "accessory";
    }
    if (title.includes("console") || title.includes("switch 2") || title.includes("switch oled")) {
      return "hardware";
    }
  }

  return "game";
}

export function isGameProduct(product: unknown): boolean {
  return getProductCategory(product) === "game";
}

export function isHardwareProduct(product: unknown): boolean {
  return getProductCategory(product) === "hardware";
}

export function isAccessoryProduct(product: unknown): boolean {
  return getProductCategory(product) === "accessory";
}

/** Canonical store category id per section, used when the store has none yet. */
export const SECTION_CATEGORY_ID: Record<CategoryType, string> = {
  game: "cat_nintendo",
  hardware: "cat_hardware",
  amiibo: "cat_amiibo",
  accessory: "cat_accessories",
  gift_card: "cat_gift_cards",
  used: "cat_used",
  bundle: "cat_bundles",
};

/** The import/details schema behind each section. Games keep their own pipeline. */
export const SECTION_SCHEMA_ID: Record<CategoryType, ProductSchemaId | undefined> = {
  game: undefined,
  hardware: "hardware",
  amiibo: "amiibo",
  accessory: "accessory",
  gift_card: "gift_card",
  used: "used",
  bundle: "bundle",
};

export function schemaForSection(type: CategoryType): ProductSchema | undefined {
  return getSchema(SECTION_SCHEMA_ID[type]);
}
