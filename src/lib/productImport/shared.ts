/**
 * Field groups every new product section shares.
 *
 * These are plain factory functions rather than exported constants so a schema
 * can tweak a label ("الجهاز" vs "المجسم") without mutating a shared object.
 * Anything genuinely section-specific lives in that section's own schema file.
 */

import type { FieldDef } from "./types";

const str = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "string", target, description, ...extra });

const num = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "number", target, description, ...extra });

const bool = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "boolean", target, description, ...extra });

const url = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "url", target, description, ...extra });

const date = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "date", target, description, ...extra });

const text = (
  key: string,
  target: string,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, type: "multiline", target, description, ...extra });

export const f = { str, num, bool, url, date, text };

/**
 * A field's `group` doubles as the Arabic section heading in the generated
 * template, so it cannot itself be a translation key. This maps each heading to
 * its `specs.groups.*` key, which is what the details page renders — otherwise
 * an English or Turkish page would show localized spec rows under an Arabic
 * heading.
 */
export const SPEC_GROUP_KEYS: Record<string, string> = {
  "الأبعاد والوزن": "physical",
  "الاتصال والمنافذ": "connectivity",
  الاتصال: "connectivity",
  "الطاقة والبطارية": "power",
  الطاقة: "power",
  الأداء: "performance",
  المتطلبات: "requirements",
  التوافق: "compatibility",
  "محتويات العلبة": "package",
  "خاص بأذرع التحكم": "controller",
  "خاص بوسائط التخزين": "storage",
  "خاص بالشواحن": "charger",
  "خاص بالكابلات": "cable",
  "خاص بالحقائب والأغطية": "protectiveCase",
  "خاص بواقيات الشاشة": "screenProtector",
  "خاص بالسماعات": "headset",
  الشخصية: "character",
  المجسم: "figure",
  "الوظائف الرقمية": "digital",
  "معلومات الجامعين": "collector",
  "الضمان والدعم": "warranty",
  "الخيارات والنسخ": "options",
};

export const AVAILABILITY_VALUES = [
  "in_stock",
  "out_of_stock",
  "preorder",
  "backorder",
  "discontinued",
  "coming_soon",
] as const;

export const PRODUCT_STATUS_VALUES = ["active", "inactive", "draft", "archived"] as const;

export const COMPATIBILITY_STATUS_VALUES = [
  "compatible",
  "partial",
  "incompatible",
  "requires_adapter",
  "unverified",
] as const;

export const VIDEO_TYPE_VALUES = [
  "official",
  "setup",
  "tutorial",
  "review",
  "demonstration",
  "unboxing",
] as const;

export const DOCUMENT_TYPE_VALUES = [
  "manual",
  "quick_start",
  "datasheet",
  "compatibility_guide",
  "driver",
  "firmware",
  "support_page",
  "safety",
] as const;

export const SOURCE_TYPE_VALUES = [
  "manufacturer",
  "official_product_page",
  "official_documentation",
  "official_support",
  "retailer",
  "press",
  "review",
] as const;

/* --------------------------------- identity -------------------------------- */

export function identityFields(nameLabel = "اسم المنتج"): FieldDef[] {
  return [
    {
      key: "schema_version",
      type: "number",
      target: "schema_version",
      required: true,
      description: "إصدار المخطط — لا تغيّره يدوياً",
      group: "الأساسيات",
    },
    str("name", "title", nameLabel, { required: true, group: "الأساسيات" }),
    str("short_name", "shortName", "اسم مختصر للعرض في البطاقات", { group: "الأساسيات" }),
    str("slug", "slug", "الرابط الفريد (يُولَّد تلقائياً إذا تُرك فارغاً)", { group: "الأساسيات" }),
    str("brand", "brand", "العلامة التجارية (Nintendo، ASUS…) — لا تُترجم", { group: "الأساسيات" }),
    str("manufacturer", "manufacturer", "الشركة المصنّعة", { group: "الأساسيات" }),
    str("series", "series", "السلسلة", { group: "الأساسيات" }),
    str("model", "model", "الموديل", { group: "الأساسيات" }),
    str("model_number", "modelNumber", "رقم الموديل", { group: "الأساسيات" }),
    str("model_year", "modelYear", "سنة الموديل", { group: "الأساسيات" }),
    str("part_number", "partNumber", "رقم القطعة", { group: "الأساسيات" }),
    str("sku", "sku", "رمز المنتج SKU", { group: "الأساسيات" }),
    str("barcode", "barcode", "الباركود", { group: "الأساسيات" }),
    str("upc", "upc", "UPC", { group: "الأساسيات" }),
    str("ean", "ean", "EAN", { group: "الأساسيات" }),
    str("gtin", "gtin", "GTIN", { group: "الأساسيات" }),
    str("category", "category", "معرّف القسم في المتجر (يُملأ تلقائياً)", { group: "الأساسيات" }),
    str("subcategory", "subcategory", "القسم الفرعي", { group: "الأساسيات" }),
    str("product_type", "productType", "نوع المنتج", { group: "الأساسيات" }),
    str("generation", "generation", "الجيل", { group: "الأساسيات" }),
    str("revision", "revision", "المراجعة/النسخة", { group: "الأساسيات" }),
    {
      key: "product_status",
      type: "enum",
      target: "productStatus",
      enumValues: PRODUCT_STATUS_VALUES,
      description: `حالة المنتج: ${PRODUCT_STATUS_VALUES.join(" / ")}`,
      group: "الأساسيات",
    },
    {
      key: "availability_status",
      type: "enum",
      target: "availabilityStatus",
      enumValues: AVAILABILITY_VALUES,
      description: `حالة التوفر: ${AVAILABILITY_VALUES.join(" / ")}`,
      group: "الأساسيات",
    },
    date("announcement_date", "announcementDate", "تاريخ الإعلان YYYY-MM-DD", {
      group: "الأساسيات",
    }),
    date("release_date", "releaseDate", "تاريخ الإصدار YYYY-MM-DD", { group: "الأساسيات" }),
    str("region", "region", "المنطقة (Global، USA، EUR، JPN)", { group: "الأساسيات" }),
    str("country_of_origin", "countryOfOrigin", "بلد المنشأ", { group: "الأساسيات" }),
    url("official_url", "officialUrl", "الموقع الرسمي للمنتج", { group: "الأساسيات" }),
    url("manufacturer_url", "manufacturerUrl", "موقع الشركة المصنّعة", { group: "الأساسيات" }),
  ];
}

/* ---------------------------- warranty & support --------------------------- */

export function warrantyFields(): FieldDef[] {
  const g = "الضمان والدعم";
  return [
    str("warranty", "warranty", "مدة الضمان (مثلاً: سنة واحدة)", { group: g }),
    str("warranty_type", "warrantyType", "نوع الضمان (وكيل، دولي، متجر)", { group: g }),
    text("warranty_notes", "warrantyNotes", "تفاصيل وملاحظات الضمان", { group: g }),
    url("support_url", "supportUrl", "رابط الدعم الرسمي", { group: g }),
    str("repairability", "repairability", "قابلية الإصلاح", { group: g }),
    bool("spare_parts_available", "sparePartsAvailable", "توفر قطع الغيار (true/false)", {
      group: g,
    }),
    text("service_notes", "serviceNotes", "ملاحظات الصيانة", { group: g }),
  ];
}

/** @deprecated Pricing and stock are managed directly by admin and removed from import templates */
export function pricingFields(): FieldDef[] {
  return [];
}

/* ------------------------------- description ------------------------------- */

export function descriptionFields(): FieldDef[] {
  const g = "الوصف";
  return [
    str("tagline", "tagline", "سطر تعريفي قصير", { group: g }),
    text("description_short", "description_short", "وصف مختصر (سطر أو سطران)", { group: g }),
    text("description_full", "description", "الوصف الكامل", { group: g }),
    text("description_ar", "description_ar", "الوصف بالعربية", { group: g }),
    text("description_en", "descriptionEn", "الوصف بالإنجليزية", { group: g }),
    text("description_tr", "descriptionTr", "الوصف بالتركية", { group: g }),
    text("overview", "overview", "نظرة عامة", { group: g }),
    {
      key: "suitable_for",
      type: "string",
      target: "suitableFor",
      repeatable: true,
      templateCount: 3,
      description: "يناسب من؟",
      group: g,
    },
    {
      key: "not_suitable_for",
      type: "string",
      target: "notSuitableFor",
      repeatable: true,
      templateCount: 2,
      description: "لا يناسب من؟",
      group: g,
    },
    {
      key: "feature",
      type: "string",
      target: "features",
      repeatable: true,
      templateCount: 5,
      description: "المميزات الرئيسية (عدد غير محدود)",
      group: g,
    },
    {
      key: "highlight",
      type: "string",
      target: "highlights",
      repeatable: true,
      templateCount: 3,
      description: "أبرز النقاط",
      group: g,
    },
    {
      key: "selling_point",
      type: "string",
      target: "sellingPoints",
      repeatable: true,
      templateCount: 3,
      description: "نقاط البيع",
      group: g,
    },
    {
      key: "tag",
      type: "string",
      target: "tags",
      repeatable: true,
      templateCount: 4,
      description: "وسوم للبحث والفلاتر",
      group: g,
    },
  ];
}

/* ----------------------------- dynamic specs ------------------------------ */

/**
 * The heart of the flexible model: instead of a column per specification, an
 * import file declares as many named groups as it needs, each holding as many
 * specs as it needs. Adding "Polling Rate" to a controller therefore never
 * requires a database migration.
 */
export function specGroupField(): FieldDef {
  return {
    key: "spec_group",
    type: "group",
    target: "specGroups",
    repeatable: true,
    templateCount: 3,
    description: "مجموعات المواصفات الديناميكية (عدد غير محدود)",
    group: "المواصفات الديناميكية",
    itemFields: {
      name: f.str("name", "name", "اسم المجموعة المعروض"),
      key: f.str("key", "key", "مفتاح المجموعة للترجمة (general, processor, display…)"),
      label_ar: f.str("label_ar", "labelAr", "اسم المجموعة بالعربية (اختياري)"),
      label_en: f.str("label_en", "labelEn", "اسم المجموعة بالإنجليزية (اختياري)"),
      label_tr: f.str("label_tr", "labelTr", "اسم المجموعة بالتركية (اختياري)"),
      order: { key: "order", type: "integer", target: "order", description: "ترتيب المجموعة" },
      spec: {
        key: "spec",
        type: "group",
        target: "specs",
        repeatable: true,
        templateCount: 4,
        description: "مواصفة داخل المجموعة",
        itemFields: {
          name: f.str("name", "name", "اسم المواصفة"),
          key: f.str("key", "key", "مفتاح المواصفة للترجمة (bluetooth_version…)"),
          label_ar: f.str("label_ar", "labelAr", "اسم المواصفة بالعربية (اختياري)"),
          label_en: f.str("label_en", "labelEn", "اسم المواصفة بالإنجليزية (اختياري)"),
          label_tr: f.str("label_tr", "labelTr", "اسم المواصفة بالتركية (اختياري)"),
          value: f.str("value", "value", "القيمة"),
          unit: f.str("unit", "unit", "الوحدة (mm, g, W, GHz…) — لا تُترجم"),
          note: f.str("note", "note", "ملاحظة"),
        },
      },
    },
  };
}

/* --------------------------- physical dimensions --------------------------- */

/**
 * `omit` lets a schema drop a scalar it defines more richly itself — amiibo, for
 * example, replaces the single `material` with an unbounded `material.N` list.
 */
export function physicalFields(omit: readonly string[] = []): FieldDef[] {
  const g = "الأبعاد والوزن";
  const all: FieldDef[] = [
    num("product_length", "productLength", "طول المنتج", {
      unit: "mm",
      specKey: "length",
      group: g,
    }),
    num("product_width", "productWidth", "عرض المنتج", { unit: "mm", specKey: "width", group: g }),
    num("product_height", "productHeight", "ارتفاع المنتج", {
      unit: "mm",
      specKey: "height",
      group: g,
    }),
    str("product_dimensions", "productDimensions", "الأبعاد كنص (مثلاً 240 × 102 × 13.9 mm)", {
      specKey: "dimensions",
      group: g,
    }),
    num("product_weight", "productWeight", "وزن المنتج", {
      unit: "g",
      specKey: "weight",
      group: g,
    }),
    num("net_weight", "netWeight", "الوزن الصافي", { unit: "g", specKey: "netWeight", group: g }),
    num("package_length", "packageLength", "طول العبوة", {
      unit: "mm",
      specKey: "packageLength",
      group: g,
    }),
    num("package_width", "packageWidth", "عرض العبوة", {
      unit: "mm",
      specKey: "packageWidth",
      group: g,
    }),
    num("package_height", "packageHeight", "ارتفاع العبوة", {
      unit: "mm",
      specKey: "packageHeight",
      group: g,
    }),
    str("package_dimensions", "packageDimensions", "أبعاد العبوة كنص", {
      specKey: "packageDimensions",
      group: g,
    }),
    num("package_weight", "packageWeight", "وزن العبوة", {
      unit: "g",
      specKey: "packageWeight",
      group: g,
    }),
    num("cbm", "cbm", "الحجم الشحني CBM", { unit: "CBM", specKey: "cbm", group: g }),
    str("material", "material", "الخامة الرئيسية", { specKey: "material", group: g }),
    str("finish", "finish", "التشطيب (مطفي، لامع…)", { specKey: "finish", group: g }),
    str("color", "color", "اللون الأساسي", { specKey: "color", group: g }),
    {
      key: "available_color",
      type: "string",
      target: "availableColors",
      repeatable: true,
      templateCount: 3,
      description: "الألوان المتاحة",
      group: g,
    },
  ];
  return all.filter((def) => !omit.includes(def.key));
}

/* ---------------------------------- media ---------------------------------- */

export function mediaFields(): FieldDef[] {
  const g = "الصور والوسائط";
  return [
    url("main_image", "mainImage", "الصورة الرئيسية", { group: g }),
    url("listing_image", "listingImage", "صورة البطاقة في القوائم", { group: g }),
    url("cover_image", "coverImage", "صورة الغلاف في صفحة التفاصيل", { group: g }),
    url("thumbnail_image", "thumbnailImage", "صورة مصغّرة", { group: g }),
    url("banner_image", "bannerImage", "صورة البنر", { group: g }),
    url("front_image", "frontImage", "صورة أمامية", { group: g }),
    url("back_image", "backImage", "صورة خلفية", { group: g }),
    url("left_image", "leftImage", "صورة جانبية يسار", { group: g }),
    url("right_image", "rightImage", "صورة جانبية يمين", { group: g }),
    url("packaging_front_image", "packagingFrontImage", "صورة العلبة من الأمام", { group: g }),
    url("packaging_back_image", "packagingBackImage", "صورة العلبة من الخلف", { group: g }),
    url("close_up_image", "closeUpImage", "صورة تفاصيل مقرّبة", { group: g }),
    {
      key: "lifestyle_image",
      type: "url",
      target: "lifestyleImages",
      repeatable: true,
      templateCount: 3,
      description: "صور الاستخدام الواقعي",
      group: g,
    },
    {
      key: "gallery",
      type: "group",
      target: "gallery",
      repeatable: true,
      templateCount: 4,
      description: "معرض الصور (عدد غير محدود)",
      group: g,
      itemFields: {
        image: f.url("image", "url", "رابط الصورة"),
        title: f.str("title", "title", "عنوان الصورة"),
        description: f.str("description", "description", "وصف الصورة"),
        type: f.str("type", "type", "التصنيف (front, back, packaging, lifestyle…)"),
      },
    },
    {
      key: "video",
      type: "group",
      target: "videos",
      repeatable: true,
      templateCount: 3,
      description: "الفيديوهات",
      group: g,
      itemFields: {
        title: f.str("title", "title", "عنوان الفيديو"),
        url: f.url("url", "url", "رابط الفيديو"),
        thumbnail: f.url("thumbnail", "thumbnail", "صورة مصغّرة"),
        type: {
          key: "type",
          type: "enum",
          target: "type",
          enumValues: VIDEO_TYPE_VALUES,
          description: `النوع: ${VIDEO_TYPE_VALUES.join(" / ")}`,
        },
      },
    },
    {
      key: "document",
      type: "group",
      target: "documents",
      repeatable: true,
      templateCount: 3,
      description: "المستندات والأدلة",
      group: g,
      itemFields: {
        title: f.str("title", "title", "عنوان المستند"),
        type: {
          key: "type",
          type: "enum",
          target: "type",
          enumValues: DOCUMENT_TYPE_VALUES,
          description: `النوع: ${DOCUMENT_TYPE_VALUES.join(" / ")}`,
        },
        url: f.url("url", "url", "رابط المستند"),
        language: f.str("language", "language", "لغة المستند"),
      },
    },
  ];
}

/* --------------------------- options and variants -------------------------- */

export function optionFields(): FieldDef[] {
  const g = "الخيارات والنسخ";
  return [
    {
      key: "option",
      type: "group",
      target: "options",
      repeatable: true,
      templateCount: 3,
      description: "خيارات المنتج الرئيسية (حساب أوفلاين، حساب أونلاين، اللون، السعة…)",
      group: g,
      itemFields: {
        id: f.str("id", "id", "معرّف الخيار (يُستخدم في variant.N.option_id)"),
        name: f.str("name", "name", "اسم الخيار (مثال: حساب أوفلاين)"),
        description: f.str("description", "description", "وصف الخيار"),
        image: f.url("image", "image", "صورة الخيار"),
      },
    },
    {
      key: "variant",
      type: "group",
      target: "variants",
      repeatable: true,
      templateCount: 3,
      description: "الأنواع والإصدارات والأسعار (يمكن ربطها بخيار محدد أو تركها للكل)",
      group: g,
      itemFields: {
        name: f.str(
          "name",
          "name",
          "اسم النوع/الإصدار (مثال: النسخة القياسية Standard / فاخر Deluxe)",
        ),
        option_id: f.str(
          "option_id",
          "optionId",
          "معرّف الخيار المرتبط (اتركه فارغاً ليكون متاحاً للكل)",
        ),
        price: f.num("price", "price", "سعر هذا النوع (د.ع)"),
        cost: f.num("cost", "cost", "تكلفة هذا النوع (د.ع)"),
        description: f.str("description", "description", "محتويات أو وصف هذا الإصدار"),
        sku: f.str("sku", "sku", "SKU الخاص بالنسخة"),
        color: f.str("color", "color", "اللون"),
        image: f.url("image", "image", "صورة النسخة"),
      },
    },
    {
      key: "color_option",
      type: "group",
      target: "colorOptions",
      repeatable: true,
      templateCount: 3,
      description: "الألوان القابلة للاختيار",
      group: g,
      itemFields: {
        name: f.str("name", "name", "اسم اللون"),
        hex: f.str("hex", "hex", "كود اللون #RRGGBB"),
        image: f.url("image", "image", "صورة اللون"),
      },
    },
  ];
}

/* ------------------------------ box contents ------------------------------- */

export function boxContentField(): FieldDef {
  return {
    key: "box_content",
    type: "group",
    target: "boxContents",
    repeatable: true,
    templateCount: 4,
    description: "محتويات العلبة",
    group: "محتويات العلبة",
    itemFields: {
      name: f.str("name", "name", "اسم العنصر"),
      quantity: {
        key: "quantity",
        type: "integer",
        target: "quantity",
        description: "الكمية",
        validation: { min: 0 },
      },
      image: f.url("image", "image", "صورة العنصر"),
      notes: f.str("notes", "notes", "ملاحظات"),
    },
  };
}

/* ------------------------------ compatibility ------------------------------ */

export function compatibilityField(description = "التوافق مع الأجهزة والمنصات"): FieldDef {
  return {
    key: "compatibility",
    type: "group",
    target: "compatibility",
    repeatable: true,
    templateCount: 4,
    description,
    group: "التوافق",
    itemFields: {
      name: f.str("name", "name", "اسم الجهاز/المنصة"),
      product: f.str("product", "product", "اسم المنتج المتوافق"),
      model: f.str("model", "model", "الموديل"),
      generation: f.str("generation", "generation", "الجيل"),
      type: f.str("type", "type", "النوع (console, pc, mobile…)"),
      status: {
        key: "status",
        type: "enum",
        target: "status",
        enumValues: COMPATIBILITY_STATUS_VALUES,
        description: `الحالة: ${COMPATIBILITY_STATUS_VALUES.join(" / ")}`,
      },
      notes: f.str("notes", "notes", "ملاحظات التوافق"),
      url: f.url("url", "url", "رابط مرجعي"),
      product_id: f.str("product_id", "productId", "معرّف منتج في المتجر للربط الداخلي"),
    },
  };
}

/* --------------------------- reviews, FAQ, sources -------------------------- */

export function socialProofFields(): FieldDef[] {
  const g = "التقييمات والأسئلة";
  return [
    f.num("review_score", "reviewScore", "متوسط تقييم النقاد (0-10)", {
      validation: { min: 0, max: 10 },
      group: g,
    }),
    f.num("user_score", "userScore", "تقييم المستخدمين (0-10)", {
      validation: { min: 0, max: 10 },
      group: g,
    }),
    {
      key: "review",
      type: "group",
      target: "externalReviews",
      repeatable: true,
      templateCount: 3,
      description: "مراجعات مختارة",
      group: g,
      itemFields: {
        source: f.str("source", "source", "الجهة"),
        score: f.str("score", "score", "الدرجة كما نشرتها الجهة"),
        quote: f.text("quote", "quote", "اقتباس"),
        url: f.url("url", "url", "رابط المراجعة"),
      },
    },
    {
      key: "pro",
      type: "string",
      target: "pros",
      repeatable: true,
      templateCount: 3,
      description: "الإيجابيات",
      group: g,
    },
    {
      key: "con",
      type: "string",
      target: "cons",
      repeatable: true,
      templateCount: 3,
      description: "السلبيات",
      group: g,
    },
    {
      key: "faq",
      type: "group",
      target: "faq",
      repeatable: true,
      templateCount: 3,
      description: "الأسئلة الشائعة",
      group: g,
      itemFields: {
        question: f.str("question", "question", "السؤال"),
        answer: f.text("answer", "answer", "الإجابة"),
      },
    },
  ];
}

export function sourceField(): FieldDef {
  return {
    key: "source",
    type: "group",
    target: "sources",
    repeatable: true,
    templateCount: 4,
    description: "المصادر — الأولوية: موقع الشركة الرسمي ثم صفحة المنتج ثم التوثيق ثم الدعم",
    group: "المصادر",
    itemFields: {
      name: f.str("name", "name", "اسم المصدر"),
      url: f.url("url", "url", "الرابط"),
      type: {
        key: "type",
        type: "enum",
        target: "type",
        enumValues: SOURCE_TYPE_VALUES,
        description: `النوع: ${SOURCE_TYPE_VALUES.join(" / ")}`,
      },
      verified_at: f.date("verified_at", "verifiedAt", "تاريخ التحقق YYYY-MM-DD"),
    },
  };
}

export function updateField(): FieldDef {
  return {
    key: "update",
    type: "group",
    target: "firmwareUpdates",
    repeatable: true,
    templateCount: 3,
    description: "تحديثات البرنامج الثابت",
    group: "التحديثات",
    itemFields: {
      version: f.str("version", "version", "رقم الإصدار"),
      date: f.date("date", "date", "تاريخ التحديث YYYY-MM-DD"),
      title: f.str("title", "title", "عنوان التحديث"),
      changes: f.text("changes", "changes", "أبرز التغييرات"),
      url: f.url("url", "url", "رابط التحديث"),
    },
  };
}

export function relatedField(): FieldDef {
  return {
    key: "related_product",
    type: "group",
    target: "relatedProducts",
    repeatable: true,
    templateCount: 3,
    description: "منتجات ذات صلة",
    group: "منتجات ذات صلة",
    itemFields: {
      product_id: f.str("product_id", "productId", "معرّف المنتج في المتجر"),
      name: f.str("name", "name", "الاسم (إذا لم يكن في المتجر)"),
      url: f.url("url", "url", "رابط"),
    },
  };
}

/* ----------------------------------- SEO ----------------------------------- */

export function seoFields(): FieldDef[] {
  const g = "تحسين محركات البحث";
  return [
    f.str("search_keywords", "searchKeywords", "كلمات البحث مفصولة بفواصل", { group: g }),
    f.str("seo_title", "seoTitle", "عنوان SEO", { group: g }),
    f.text("seo_description", "seoDescription", "وصف SEO", { group: g }),
    f.url("og_image", "ogImage", "صورة OpenGraph", { group: g }),
    f.str("og_title", "ogTitle", "عنوان OpenGraph", { group: g }),
    f.text("og_description", "ogDescription", "وصف OpenGraph", { group: g }),
  ];
}
