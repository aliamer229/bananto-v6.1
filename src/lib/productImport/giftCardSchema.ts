/**
 * Gift cards & top-up schema.
 *
 * A prepaid code is not a physical product: what a buyer needs to know is the
 * face value, the region it is locked to, how the code arrives, and exactly how
 * to redeem it. So the section keeps its own details page instead of borrowing
 * the game or hardware one.
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
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const CARD = "بيانات البطاقة";
const DELIVERY = "التسليم والاستخدام";

export const CARD_TYPE_VALUES = [
  "eshop",
  "nintendo_online",
  "nintendo_online_expansion",
  "psn",
  "xbox",
  "steam",
  "google_play",
  "itunes",
  "other",
] as const;

export const DELIVERY_METHOD_VALUES = [
  "instant_code",
  "manual_code",
  "email",
  "account_topup",
  "physical_card",
] as const;

export const VALIDITY_VALUES = [
  "no_expiry",
  "12_months",
  "6_months",
  "3_months",
  "1_month",
] as const;

const card: FieldDef[] = [
  {
    key: "card_type",
    type: "enum",
    target: "cardType",
    required: true,
    enumValues: CARD_TYPE_VALUES,
    description: `نوع البطاقة: ${CARD_TYPE_VALUES.join(" / ")}`,
    group: CARD,
  },
  f.str("card_value", "cardValue", "القيمة الاسمية للبطاقة (10$، 20$، 3 أشهر…)", {
    specKey: "cardValue",
    group: CARD,
  }),
  f.str("card_currency", "cardCurrency", "عملة البطاقة (USD، EUR…)", {
    specKey: "cardCurrency",
    group: CARD,
  }),
  f.str("card_region", "cardRegion", "ريجون البطاقة (US، EU، JP) — يجب أن يطابق ريجون الحساب", {
    specKey: "cardRegion",
    group: CARD,
  }),
  f.bool("region_locked", "regionLocked", "مقيدة بالريجون (true/false)", {
    specKey: "regionLocked",
    group: CARD,
  }),
  f.str("platform", "platform", "المنصة (Nintendo Switch، Switch 2…)", {
    specKey: "platform",
    group: CARD,
  }),
  f.str("code_length", "codeLength", "طول الكود (16 خانة…)", {
    specKey: "codeLength",
    group: CARD,
  }),
  {
    key: "validity",
    type: "enum",
    target: "validity",
    enumValues: VALIDITY_VALUES,
    description: `صلاحية الكود: ${VALIDITY_VALUES.join(" / ")}`,
    group: CARD,
  },
  f.date("expiry_date", "expiryDate", "تاريخ انتهاء الصلاحية YYYY-MM-DD", { group: CARD }),
  f.url("card_artwork", "cardArtwork", "صورة كرت التعبئة (Card Artwork)", { group: CARD }),
  f.url("region_banner", "regionBanner", "بانر الريجون التوضيحي (Region Banner)", { group: CARD }),
];

const delivery: FieldDef[] = [
  {
    key: "delivery_method",
    type: "enum",
    target: "deliveryMethod",
    required: true,
    enumValues: DELIVERY_METHOD_VALUES,
    description: `طريقة التسليم: ${DELIVERY_METHOD_VALUES.join(" / ")}`,
    group: DELIVERY,
  },
  f.str("delivery_time", "deliveryTime", "زمن التسليم المتوقع (فوري، خلال ساعة…)", {
    specKey: "deliveryTime",
    group: DELIVERY,
  }),
  {
    key: "redeem_step",
    type: "string",
    target: "redemptionSteps",
    repeatable: true,
    templateCount: 5,
    description: "خطوات التفعيل والشحن — خطوة واحدة في كل سطر (عدد غير محدود)",
    group: DELIVERY,
  },
  f.text(
    "redemption_guide",
    "redemptionGuide",
    "خطوات استخدام الكود كنص واحد (بديل عن redeem_step)",
    {
      group: DELIVERY,
    },
  ),
  f.url("redemption_url", "redemptionUrl", "رابط صفحة استبدال الكود الرسمية", { group: DELIVERY }),
  f.text("usage_terms", "usageTerms", "شروط الاستخدام والقيود", { group: DELIVERY }),
  f.text("refund_policy", "refundPolicy", "سياسة الاسترجاع", { group: DELIVERY }),
  {
    key: "requirement",
    type: "string",
    target: "requirements",
    repeatable: true,
    templateCount: 4,
    description: "المتطلبات قبل الشراء (حساب أمريكي، اتصال بالإنترنت…)",
    group: DELIVERY,
  },
];

export const GIFT_CARD_SCHEMA: ProductSchema = {
  id: "gift_card",
  version: 2,
  label: "كروت التعبئة والبطاقات",
  labelKey: "category.giftCards",
  categoryId: "cat_gift_cards",
  kind: "digital_code",
  templateFile: "gift-card-product-template.txt",
  fields: classify(
    [
      ...identityFields("اسم البطاقة"),
      ...descriptionFields(),
      ...card,
      ...delivery,
      specGroupField(),
      ...mediaFields(),
      ...optionFields(),
      ...socialProofFields(),
      relatedField(),
      sourceField(),
      ...fieldSourceFields(),
      ...seoFields(),
    ],
    {
      required: [
        "name",
        "card_type",
        "card_value",
        "card_currency",
        "card_region",
        "delivery_method",
      ],
      recommended: [
        "platform",
        "region_locked",
        "validity",
        "delivery_time",
        "redeem_step",
        "redemption_url",
        "requirement",
        "refund_policy",
        "usage_terms",
        "card_artwork",
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
