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
  const cid = String(categoryId || "").trim().toLowerCase();

  // 1. Exact canonical category IDs / Slugs from database (Source of Truth)
  if (
    cid === "nintendo-switch-games" ||
    cid === "cat_nintendo" ||
    cid === "nintendo_games" ||
    cid === "cat_1" ||
    cid === "games" ||
    cid === "game"
  ) {
    return "game";
  }

  if (cid === "hardware" || cid === "cat_hardware" || cid === "consoles" || cid === "devices") {
    return "hardware";
  }

  if (cid === "accessories" || cid === "cat_accessories" || cid === "accessory") {
    return "accessory";
  }

  if (cid === "amiibo" || cid === "cat_amiibo" || cid === "figures" || cid === "collectibles") {
    return "amiibo";
  }

  if (
    cid === "gift-cards" ||
    cid === "gift_cards" ||
    cid === "cat_gift_cards" ||
    cid === "gift_card" ||
    cid === "cards"
  ) {
    return "gift_card";
  }

  if (cid === "used" || cid === "cat_used" || cid === "preowned") {
    return "used";
  }

  if (cid === "bundles" || cid === "cat_bundles" || cid === "bundle") {
    return "bundle";
  }

  // 2. Category Title check (if custom category title is provided)
  const title = String(categoryTitle || "").trim().toLowerCase();
  if (title) {
    if (
      title.includes("لعب") ||
      title.includes("ألعاب") ||
      title.includes("العاب") ||
      title.includes("game")
    ) {
      return "game";
    }
    if (title.includes("بندل") || title.includes("حزم") || title.includes("bundle")) {
      return "bundle";
    }
    if (
      title.includes("هاردوير") ||
      title.includes("أجهزة") ||
      title.includes("اجهزة") ||
      title.includes("hardware") ||
      title.includes("console")
    ) {
      return "hardware";
    }
    if (
      title.includes("إكسسوار") ||
      title.includes("اكسسوار") ||
      title.includes("ملحق") ||
      title.includes("accessor")
    ) {
      return "accessory";
    }
    if (title.includes("اميبو") || title.includes("amiibo") || title.includes("مجسم")) {
      return "amiibo";
    }
    if (
      title.includes("كروت") ||
      title.includes("بطاق") ||
      title.includes("شحن") ||
      title.includes("تعبئ") ||
      title.includes("gift")
    ) {
      return "gift_card";
    }
    if (
      title.includes("مستعمل") ||
      title.includes("مستخدم") ||
      title.includes("مستعملة") ||
      title.includes("used")
    ) {
      return "used";
    }
  }

  // 3. Fallback to schemaId or kind ONLY if no recognized category exists
  const sid = String(schemaId || "").trim().toLowerCase();
  if (sid === "hardware") return "hardware";
  if (sid === "amiibo") return "amiibo";
  if (sid === "accessory") return "accessory";
  if (sid === "gift_card") return "gift_card";
  if (sid === "used") return "used";
  if (sid === "bundle") return "bundle";

  const k = String(kind || "").trim().toLowerCase();
  if (k === "hardware" || k === "device") return "hardware";
  if (k === "accessory") return "accessory";
  if (k === "amiibo" || k === "collectible") return "amiibo";
  if (k === "bundle") return "bundle";
  if (k === "digital_code" || k === "gift_card") return "gift_card";
  if (k === "used") return "used";

  return "game";
}

/**
 * Strict product classifier.
 * Category ID/slug from the database is the primary source of truth.
 * Never uses title matching, platform, image, or metadata to guess categories.
 */
export function getProductCategory(product: unknown): CategoryType {
  if (!product || typeof product !== "object") return "game";
  const p = product as Record<string, any>;

  // 1. Primary: Category ID / Slug from product record
  const categoryId = String(p.category || p.categoryId || p.category_id || "").trim().toLowerCase();
  const categoryTitle = String(p.categoryTitle || p.category_title || "").trim().toLowerCase();

  if (categoryId || categoryTitle) {
    return resolveCategoryType(categoryId, categoryTitle);
  }

  // 2. Secondary: SchemaId or Kind ONLY if product has no category specified
  const schemaId = String(p.schemaId || p.schema?.id || p.schema_id || "").trim().toLowerCase();
  const kind = String(p.kind || "").trim().toLowerCase();

  return resolveCategoryType("", "", kind, schemaId);
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
