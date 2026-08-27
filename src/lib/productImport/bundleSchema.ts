/**
 * Account bundle schema.
 *
 * A bundle is sold on what it contains and how the account access works, so the
 * section is built around the included titles, the access type, and the saving
 * against buying each title separately.
 */

import {
  classify,
  descriptionFields,
  f,
  identityFields,
  mediaFields,
  optionFields,
  relatedField,
  seoFields,
  socialProofFields,
  fieldSourceFields,
  sourceField,
  specGroupField,
  setupStepsFields,
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const BUNDLE = "تفاصيل البندل";
const ACCESS = "الوصول والحساب";

export const ACCOUNT_TYPE_VALUES = ["primary", "secondary", "full_account", "shared"] as const;

const bundle: FieldDef[] = [
  f.text("bundle_games_summary", "bundleGamesSummary", "ملخص محتوى الحزمة", { group: BUNDLE }),
  f.str("badge", "badge", "شارة العرض (وفر 40%…)", { group: BUNDLE }),
  f.num("games_count", "gamesCount", "عدد الألعاب داخل الحزمة", {
    specKey: "gamesCount",
    group: BUNDLE,
  }),
  f.num("savings_percent", "savingsPercent", "نسبة التوفير", {
    unit: "%",
    specKey: "savingsPercent",
    group: BUNDLE,
  }),
  f.date("offer_ends_at", "offerEndsAt", "تاريخ انتهاء العرض YYYY-MM-DD", { group: BUNDLE }),
  {
    key: "bundle_item",
    type: "group",
    target: "bundleItems",
    repeatable: true,
    templateCount: 8,
    description: "الألعاب/القطع المشمولة في الحزمة",
    group: BUNDLE,
    itemFields: {
      title: f.str("title", "title", "اسم اللعبة — لا يُترجم"),
      platform: f.str("platform", "platform", "المنصة"),
      edition: f.str("edition", "edition", "الإصدار"),
      value_iqd: f.num("value_iqd", "valueIqd", "قيمتها المفردة بالدينار"),
      product_id: f.str("product_id", "productId", "معرّف المنتج في المتجر إن وُجد"),
      cover_url: f.url("cover_url", "coverUrl", "رابط الغلاف"),
    },
  },
];

const access: FieldDef[] = [
  {
    key: "account_type",
    type: "enum",
    target: "accountType",
    required: true,
    enumValues: ACCOUNT_TYPE_VALUES,
    description: `نوع الوصول: ${ACCOUNT_TYPE_VALUES.join(" / ")}`,
    group: ACCESS,
  },
  f.str("platform", "platform", "المنصة (Nintendo Switch، Switch 2…)", {
    specKey: "platform",
    group: ACCESS,
  }),
  f.num("devices_limit", "devicesLimit", "عدد الأجهزة المسموح بها", {
    specKey: "devicesLimit",
    group: ACCESS,
  }),
  f.bool("online_play", "onlinePlay", "يدعم اللعب أونلاين (true/false)", {
    specKey: "onlinePlay",
    group: ACCESS,
  }),
  f.str("delivery_time", "deliveryTime", "زمن التسليم المتوقع", {
    specKey: "deliveryTime",
    group: ACCESS,
  }),
  f.text("account_terms", "accountTerms", "شروط استخدام الحساب", { group: ACCESS }),
  f.text("support_policy", "supportPolicy", "سياسة الدعم والاستبدال", { group: ACCESS }),
  {
    key: "included_service",
    type: "string",
    target: "includedServices",
    repeatable: true,
    templateCount: 4,
    description: "خدمات مشمولة (Nintendo Online، دعم فني، تحديثات…)",
    group: ACCESS,
  },
];

export const BUNDLE_SCHEMA: ProductSchema = {
  id: "bundle",
  version: 2,
  label: "بندلات الحسابات",
  labelKey: "category.bundles",
  categoryId: "cat_bundles",
  kind: "bundle",
  templateFile: "bundle-product-template.txt",
  fields: classify(
    [
      ...identityFields("اسم البندل"),
      ...descriptionFields(),
      ...bundle,
      ...access,
      specGroupField(),
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
      required: ["name", "bundle_item", "games_count", "account_type"],
      recommended: [
        "bundle_games_summary",
        "savings_percent",
        "platform",
        "devices_limit",
        "online_play",
        "delivery_time",
        "account_terms",
        "support_policy",
        "included_service",
        "setup_step",
        "main_image",
        "listing_image",
        "description_ar",
        "description_short",
        "source",
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
