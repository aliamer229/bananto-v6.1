/**
 * Amiibo & Figures import schema.
 *
 * An amiibo is not an accessory with a picture on it: what a collector actually
 * wants to know is which character it is, which wave it shipped in, how rare it
 * is, and — crucially — *what it does inside each game*. So `game_compatibility`
 * captures the function and the reward per title rather than a bare
 * "compatible" flag, and collector metadata gets its own first-class block.
 */

import {
  classify,
  boxContentField,
  descriptionFields,
  f,
  identityFields,
  mediaFields,
  optionFields,
  physicalFields,
  relatedField,
  seoFields,
  socialProofFields,
  fieldSourceFields,
  sourceField,
  specGroupField,
  setupStepsFields,
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const CHARACTER = "الشخصية";
const FIGURE = "المجسم";
const DIGITAL = "الوظائف الرقمية";
const COLLECTOR = "معلومات الجامعين";

export const FIGURE_TYPE_VALUES = [
  "amiibo",
  "standard_figure",
  "collectible_figure",
  "statue",
  "mini_figure",
  "limited_edition",
  "special_edition",
] as const;

export const RARITY_VALUES = [
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "exclusive",
  "grail",
] as const;

export const PRODUCTION_STATUS_VALUES = [
  "in_production",
  "discontinued",
  "reprint",
  "limited_run",
  "announced",
] as const;

export const EDITION_VALUES = [
  "standard",
  "limited",
  "exclusive",
  "anniversary",
  "special",
  "store_exclusive",
  "region_exclusive",
] as const;

const character: FieldDef[] = [
  f.str("official_name", "officialName", "الاسم الرسمي كما ورد من نينتندو", { group: CHARACTER }),
  f.str("character", "character", "اسم الشخصية — لا يُترجم", { group: CHARACTER }),
  f.str("character_full_name", "characterFullName", "الاسم الكامل للشخصية", { group: CHARACTER }),
  f.str("franchise", "franchise", "العالم/الامتياز (Super Mario، Zelda…) — لا يُترجم", {
    group: CHARACTER,
  }),
  f.str("game_origin", "gameOrigin", "اللعبة التي ظهرت فيها الشخصية أولاً", { group: CHARACTER }),
  f.text("character_description", "characterDescription", "وصف الشخصية", { group: CHARACTER }),
  f.text("character_biography", "characterBiography", "نبذة عن الشخصية", { group: CHARACTER }),
  f.str("amiibo_series", "amiiboSeries", "سلسلة amiibo", { group: CHARACTER }),
  f.str("figure_series", "figureSeries", "سلسلة المجسمات", { group: CHARACTER }),
  f.str("character_variant", "characterVariant", "النسخة/الاختلاف", { group: CHARACTER }),
  f.str("costume", "costume", "الزي", { group: CHARACTER }),
  f.str("publisher", "publisher", "الناشر", { group: CHARACTER }),
];

const figure: FieldDef[] = [
  {
    key: "figure_type",
    type: "enum",
    target: "figureType",
    enumValues: FIGURE_TYPE_VALUES,
    description: `نوع المجسم: ${FIGURE_TYPE_VALUES.join(" / ")}`,
    group: FIGURE,
  },
  f.str("pose", "pose", "وضعية المجسم", { specKey: "pose", group: FIGURE }),
  f.str("base_design", "baseDesign", "تصميم القاعدة", { specKey: "baseDesign", group: FIGURE }),
  f.num("base_diameter", "baseDiameter", "قطر القاعدة", {
    unit: "mm",
    specKey: "baseDiameter",
    group: FIGURE,
  }),
  f.str("figure_material", "figureMaterial", "خامة المجسم", {
    specKey: "figureMaterial",
    group: FIGURE,
  }),
  f.str("base_material", "baseMaterial", "خامة القاعدة", {
    specKey: "baseMaterial",
    group: FIGURE,
  }),
  f.str("scale", "scale", "المقياس (1:6…)", { specKey: "scale", group: FIGURE }),
  f.str("main_colors", "mainColors", "الألوان الأساسية", { specKey: "mainColors", group: FIGURE }),
  f.str("paint_details", "paintDetails", "تفاصيل الطلاء", {
    specKey: "paintDetails",
    group: FIGURE,
  }),
  f.str("special_effects", "specialEffects", "تأثيرات خاصة (توهج، شفافية…)", {
    specKey: "specialEffects",
    group: FIGURE,
  }),
  f.str("sculptor", "sculptor", "النحّات", { group: FIGURE }),
  f.str("designer", "designer", "المصمم", { group: FIGURE }),
  {
    key: "material",
    type: "string",
    target: "materials",
    repeatable: true,
    templateCount: 3,
    description: "الخامات (PVC، ABS، Resin، Metal، Fabric)",
    group: FIGURE,
  },
];

const digital: FieldDef[] = [
  f.bool("nfc_support", "nfcSupport", "يدعم NFC (true/false)", {
    specKey: "nfcSupport",
    group: DIGITAL,
  }),
  f.str("nfc_type", "nfcType", "نوع شريحة NFC", { specKey: "nfcType", group: DIGITAL }),
  f.text("amiibo_functionality", "amiiboFunctionality", "ماذا يفعل هذا الـamiibo بشكل عام", {
    group: DIGITAL,
  }),
  f.bool("read_support", "readSupport", "يدعم القراءة (true/false)", {
    specKey: "readSupport",
    group: DIGITAL,
  }),
  f.bool("write_support", "writeSupport", "يدعم الكتابة (true/false)", {
    specKey: "writeSupport",
    group: DIGITAL,
  }),
  f.bool("save_data_support", "saveDataSupport", "يخزّن بيانات حفظ (true/false)", {
    specKey: "saveDataSupport",
    group: DIGITAL,
  }),
  {
    key: "compatible_console",
    type: "string",
    target: "compatibleConsoles",
    repeatable: true,
    templateCount: 3,
    description: "الأجهزة المتوافقة (Nintendo Switch، Switch 2، Wii U، 3DS)",
    group: DIGITAL,
  },
  {
    key: "game_compatibility",
    type: "group",
    target: "gameCompatibility",
    repeatable: true,
    templateCount: 5,
    description:
      'ماذا يفعل هذا الـamiibo داخل كل لعبة — لا تكتفِ بكلمة "متوافق"، اذكر الوظيفة والمكافأة',
    group: DIGITAL,
    itemFields: {
      game: f.str("game", "game", "اسم اللعبة — لا يُترجم"),
      platform: f.str("platform", "platform", "المنصة"),
      function: f.str("function", "function", "الوظيفة (فتح محتوى، استدعاء رفيق…)"),
      reward: f.str("reward", "reward", "المكافأة (عنصر، زي، شخصية…)"),
      description: f.text("description", "description", "شرح تفصيلي"),
      source_url: f.url("source_url", "sourceUrl", "رابط المصدر الرسمي"),
    },
  },
];

const collector: FieldDef[] = [
  {
    key: "edition",
    type: "enum",
    target: "edition",
    enumValues: EDITION_VALUES,
    description: `الإصدار: ${EDITION_VALUES.join(" / ")}`,
    group: COLLECTOR,
  },
  {
    key: "rarity",
    type: "enum",
    target: "rarity",
    enumValues: RARITY_VALUES,
    description: `الندرة: ${RARITY_VALUES.join(" / ")}`,
    group: COLLECTOR,
  },
  {
    key: "production_status",
    type: "enum",
    target: "productionStatus",
    enumValues: PRODUCTION_STATUS_VALUES,
    description: `حالة الإنتاج: ${PRODUCTION_STATUS_VALUES.join(" / ")}`,
    group: COLLECTOR,
  },
  f.str("collection_series", "collectionSeries", "سلسلة المجموعة", { group: COLLECTOR }),
  f.str("collection_number", "collectionNumber", "رقم القطعة في المجموعة", { group: COLLECTOR }),
  f.str("release_wave", "releaseWave", "موجة الإصدار", { group: COLLECTOR }),
  f.str("exclusive_retailer", "exclusiveRetailer", "المتجر الحصري", { group: COLLECTOR }),
  f.bool("region_exclusive", "regionExclusive", "حصري لمنطقة معينة (true/false)", {
    group: COLLECTOR,
  }),
  f.date("re_release_date", "reReleaseDate", "تاريخ إعادة الإصدار YYYY-MM-DD", {
    group: COLLECTOR,
  }),
  f.bool("is_reprint", "isReprint", "طبعة معاد إصدارها (true/false)", { group: COLLECTOR }),
  f.str("packaging_type", "packagingType", "نوع التغليف (علبة، بليستر…)", { group: COLLECTOR }),
  f.text("collector_notes", "collectorNotes", "ملاحظات للجامعين", { group: COLLECTOR }),
];

export const AMIIBO_SCHEMA: ProductSchema = {
  id: "amiibo",
  version: 2,
  label: "amiibo والمجسمات",
  labelKey: "category.amiibo",
  categoryId: "cat_amiibo",
  kind: "collectible",
  templateFile: "amiibo-product-template.txt",
  fields: classify(
    [
      ...identityFields("اسم المنتج"),
      ...descriptionFields(),
      ...character,
      ...figure,
      ...digital,
      ...collector,
      // amiibo lists several materials, so the shared single `material` scalar
      // would shadow the richer `material.N` list defined above.
      ...physicalFields(["material"]),
      specGroupField(),
      boxContentField(),
      ...setupStepsFields(),
      ...mediaFields(),
      ...optionFields(),
      ...socialProofFields(),
      relatedField(),
      sourceField(),
      ...fieldSourceFields(),
      ...seoFields(),
    ],
    {
      required: ["name", "official_name", "character", "figure_type", "franchise"],
      recommended: [
        "amiibo_series",
        "character_description",
        "game_compatibility",
        "compatible_console",
        "amiibo_functionality",
        "nfc_support",
        "release_date",
        "rarity",
        "edition",
        "production_status",
        "main_image",
        "listing_image",
        "front_image",
        "back_image",
        "packaging_front_image",
        "packaging_back_image",
        "description_ar",
        "description_short",
        "product_height",
        "source",
        "box_content",
      ],
      internal: [
        "search_keywords",
        "seo_title",
        "seo_description",
        "og_image",
        "og_title",
        "og_description",
      ],
    },
  ),
};
