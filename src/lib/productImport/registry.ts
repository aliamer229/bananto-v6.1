/**
 * Maps a store category / product kind onto the schema that describes it.
 *
 * The admin editor uses this to decide which template to offer and which parser
 * schema to validate against; the storefront uses it to decide which details
 * layout to render. Nintendo Switch Games deliberately stays outside the
 * registry — it keeps its own long-standing schema and Game Hub page untouched.
 */

import { ACCESSORY_SCHEMA } from "./accessorySchema";
import { AMIIBO_SCHEMA } from "./amiiboSchema";
import { BUNDLE_SCHEMA } from "./bundleSchema";
import { GIFT_CARD_SCHEMA } from "./giftCardSchema";
import { HARDWARE_SCHEMA } from "./hardwareSchema";
import { USED_SCHEMA } from "./usedSchema";
import type { ProductSchema } from "./types";

export const PRODUCT_SCHEMAS: ProductSchema[] = [
  HARDWARE_SCHEMA,
  AMIIBO_SCHEMA,
  ACCESSORY_SCHEMA,
  GIFT_CARD_SCHEMA,
  USED_SCHEMA,
  BUNDLE_SCHEMA,
];

export type ProductSchemaId = "hardware" | "amiibo" | "accessory" | "gift_card" | "used" | "bundle";

export function getSchema(id: string | undefined): ProductSchema | undefined {
  return PRODUCT_SCHEMAS.find((s) => s.id === id);
}

/** The store categories these schemas create on first run. */
export const MANAGED_CATEGORIES = PRODUCT_SCHEMAS.map((schema, index) => ({
  id: schema.categoryId,
  title: schema.label,
  labelKey: schema.labelKey,
  schemaId: schema.id,
  displayOrder: index,
}));

const CATEGORY_HINTS: Record<string, ProductSchemaId> = {
  cat_hardware: "hardware",
  hardware: "hardware",
  cat_amiibo: "amiibo",
  amiibo: "amiibo",
  cat_accessories: "accessory",
  accessories: "accessory",
  accessory: "accessory",
  cat_gift_cards: "gift_card",
  gift_cards: "gift_card",
  gift_card: "gift_card",
  eshop: "gift_card",
  cat_used: "used",
  used: "used",
  preowned: "used",
  cat_bundles: "bundle",
  bundles: "bundle",
  bundle: "bundle",
};

const KIND_HINTS: Record<string, ProductSchemaId> = {
  hardware: "hardware",
  device: "hardware",
  collectible: "amiibo",
  accessory: "accessory",
  digital_code: "gift_card",
  gift_card: "gift_card",
  used: "used",
  bundle: "bundle",
};

/**
 * Best-effort schema detection for a stored product record. Explicit markers
 * win; category and kind are fallbacks so products created before this system
 * existed still resolve to something sensible.
 */
export function detectSchemaId(
  product: Record<string, unknown> | undefined,
): ProductSchemaId | undefined {
  if (!product) return undefined;

  const explicit = String(product["schemaId"] ?? product["schema_id"] ?? "");
  if (explicit && getSchema(explicit)) return explicit as ProductSchemaId;

  const category = String(product["category"] ?? product["categoryId"] ?? "").toLowerCase();
  if (CATEGORY_HINTS[category]) return CATEGORY_HINTS[category];

  const kind = String(product["kind"] ?? "").toLowerCase();
  // A collectible without amiibo/figure markers is more likely a boxed extra.
  if (kind === "collectible" && !product["character"] && !product["figureType"]) {
    return "accessory";
  }
  if (KIND_HINTS[kind]) return KIND_HINTS[kind];

  return undefined;
}

export function detectSchema(
  product: Record<string, unknown> | undefined,
): ProductSchema | undefined {
  return getSchema(detectSchemaId(product));
}
