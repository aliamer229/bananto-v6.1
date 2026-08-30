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

/**
 * Every category id that has existed in the storefront.
 *
 * The public catalogue deliberately accepts these aliases, so the admin D1
 * projection must accept the same set when filtering. Without this shared
 * list, selecting the store category `gift-cards` returned zero rows while the
 * products themselves were indexed under `cat_gift_cards`.
 */
export const SECTION_CATEGORY_ALIASES: Record<CategoryType, readonly string[]> = {
  game: ["nintendo-switch-games", "cat_nintendo", "nintendo_games", "cat_1", "games", "game"],
  hardware: ["hardware", "cat_hardware", "consoles", "devices"],
  amiibo: ["amiibo", "cat_amiibo", "figures", "collectibles"],
  accessory: ["accessories", "cat_accessories", "accessory"],
  gift_card: ["gift-cards", "gift_cards", "cat_gift_cards", "gift_card", "cards"],
  used: ["used", "cat_used", "preowned"],
  bundle: ["bundles", "cat_bundles", "bundle"],
};

/**
 * Returns the complete alias family for a known section id. Unknown custom
 * categories keep exact-match behaviour instead of being guessed as games.
 */
export function categoryFilterAliases(categoryId?: string): string[] {
  const id = String(categoryId || "").trim().toLowerCase();
  if (!id) return [];
  for (const aliases of Object.values(SECTION_CATEGORY_ALIASES)) {
    if (aliases.includes(id)) return [...aliases];
  }
  return [id];
}

export function resolveCategoryType(
  categoryId?: string,
  categoryTitle?: string,
  kind?: string,
  schemaId?: string,
): CategoryType {
  const cid = String(categoryId || "").trim().toLowerCase();

  // 1. Exact canonical category IDs / Slugs from database (Source of Truth)
  for (const [section, aliases] of Object.entries(SECTION_CATEGORY_ALIASES) as Array<
    [CategoryType, readonly string[]]
  >) {
    if (aliases.includes(cid)) return section;
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
