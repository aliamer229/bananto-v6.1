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
