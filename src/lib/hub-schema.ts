/**
 * Declarative field schema for the product hub.
 *
 * One source of truth shared by two consumers:
 *  - the admin product editor renders these groups as tabs, in this order;
 *  - the product page renders its sections in the same order and hides any
 *    section whose fields are empty.
 *
 * Adding a field here makes it editable in the admin panel and readable on the
 * page without touching either renderer.
 */

export type FieldType =
  "text" | "textarea" | "number" | "bool" | "image" | "url" | "select" | "list";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For `list`: the shape of one row. */
  itemFields?: FieldDef[];
  /** Rendered full width in the admin grid. */
  wide?: boolean;
  hint?: string;
}

export interface GroupDef {
  /** Stable id; also the anchor id of the matching page section. */
  id: string;
  label: string;
  /** Section title on the product page (omit to reuse `label`). */
  sectionTitle?: string;
  fields: FieldDef[];
}

const money = (key: string, label: string): FieldDef => ({ key, label, type: "number" });

export const HUB_GROUPS: GroupDef[] = [
  {
    id: "prices",
    label: "الأسعار والتوفر",
    sectionTitle: "الأسعار والشراء",
    fields: [
      { key: "accountEnabled", label: "بيع حساب أوفلاين", type: "bool" },
      money("accountPrice", "سعر الحساب"),
      { key: "accountStock", label: "عدد الحسابات المتوفرة", type: "number" },
      { key: "accountInfinite", label: "مخزون الحسابات غير محدود", type: "bool" },
      { key: "accountNote", label: "ملاحظة تسليم الحساب", type: "textarea", wide: true },
      { key: "accountRegion", label: "منطقة الحساب (JP افتراضياً)", type: "text" },
      { key: "accountOnlineEnabled", label: "بيع حساب أونلاين", type: "bool" },
      money("accountOnlinePrice", "سعر الحساب الأونلاين"),
      { key: "accountOnlineStock", label: "عدد الحسابات الأونلاين", type: "number" },
      { key: "accountOnlineInfinite", label: "مخزون الأونلاين غير محدود", type: "bool" },
      { key: "accountOnlineNote", label: "ملاحظة الحساب الأونلاين", type: "textarea", wide: true },
      { key: "lendEnabled", label: "إقراض كارتلج", type: "bool" },
      money("lendPrice", "سعر الإقراض"),
      { key: "lendAvailableNow", label: "متوفر الآن", type: "bool" },
      { key: "lendPreorder", label: "يقبل طلب مسبق", type: "bool" },
      { key: "lendCopies", label: "عدد النسخ المتاحة للإقراض", type: "number" },
      { key: "lendRegion", label: "المنطقة / مناطق التسليم", type: "text" },
      { key: "lendTerms", label: "شروط الإقراض", type: "textarea", wide: true },
      { key: "discEnabled", label: "بيع قرص (كارتلج)", type: "bool" },
      money("discPrice", "سعر القرص"),
      {
        key: "discCondition",
        label: "حالة القرص",
        type: "select",
        options: [
          { value: "new", label: "جديد" },
          { value: "used", label: "مستعمل" },
        ],
      },
      { key: "discStock", label: "عدد الأقراص المتوفرة", type: "number" },
      { key: "gameIsOffline", label: "هل اللعبة اوفلاين", type: "bool" },
      { key: "gameIsOnline", label: "هل تستطيع اللعب اونلاين", type: "bool" },
      {
        key: "gameLanguageLocked",
        label: "هل فيها قفل لغة اقليمي (لا توجد انجليزية)",
        type: "bool",
      },
    ],
  },
  {
    id: "nintendo",
    label: "نينتندو",
    sectionTitle: "على نينتندو سويتش",
    fields: [
      { key: "nintendoEshopUrl", label: "رابط eShop الرسمي", type: "url", wide: true },
      { key: "ageRating", label: "التصنيف العمري (PEGI/ESRB)", type: "text" },
      { key: "metacriticRating", label: "التقييم (Metacritic)", type: "number" },
      { key: "nintendoOnlineRequired", label: "هل تتطلب Nintendo Switch Online", type: "bool" },
      { key: "nintendoCloudSaves", label: "هل يدعم الحفظ السحابي", type: "bool" },
      { key: "nintendoGameKeyCard", label: "هل بطاقة مفتاح اللعبة Game-Key Card", type: "bool" },
      {
        key: "nintendoPhysicalNeedsDownload",
        label: "هل النسخة الفعلية تتطلب تنزيلاً",
        type: "bool",
      },
      {
        key: "nintendoPlayModes",
        label: "أنماط اللعب (تلفاز، محمول، طاولة)",
        type: "text",
        wide: true,
      },
      { key: "nintendoNotes", label: "ملاحظات نينتندو", type: "textarea", wide: true },
    ],
  },
  {
    id: "switch2",
    label: "Switch 2",
    sectionTitle: "تحسينات Nintendo Switch 2",
    fields: [
      { key: "switch2Enhanced", label: "هل هي نسخة محسنة لـ 2 Switch", type: "bool" },
      { key: "switch2UpgradePrice", label: "سعر ترقية النسخة", type: "number" },
      {
        key: "switch2Features",
        label: "مزايا 2 Switch",
        type: "textarea",
        wide: true,
        hint: "سطر لكل ميزة",
      },
    ],
  },
  {
    id: "overview",
    label: "نظرة عامة",
    sectionTitle: "نظرة عامة",
    fields: [
      { key: "tagline", label: "سطر التعريف", type: "text", wide: true },
      { key: "fitFor", label: "تناسب من؟", type: "list", wide: true },
      { key: "notFitFor", label: "لا تناسب من؟", type: "list", wide: true },
      { key: "playTimeMain", label: "ساعات القصة الرئيسية", type: "number" },
      { key: "playTimeFull", label: "ساعات الإكمال الكامل", type: "number" },
    ],
  },
  {
    id: "overview_content",
    label: "نظرة عامة إضافية",
    fields: [{ key: "features", label: "المميزات", type: "list", wide: true }],
  },
  {
    id: "editions",
    label: "النسخ والإصدارات",
    sectionTitle: "النسخ والإصدارات",
    fields: [
      {
        key: "editionsList",
        label: "النسخ",
        type: "list",
        wide: true,
        itemFields: [
          { key: "name", label: "اسم النسخة", type: "text" },
          { key: "price", label: "السعر (USD)", type: "number" },
          { key: "coverUrl", label: "غلاف النسخة", type: "image" },
          { key: "contents", label: "المحتويات", type: "list" },
        ],
      },
    ],
  },
  {
    id: "gameplay",
    label: "الأسلوب وركائز اللعب",
    sectionTitle: "الأسلوب وركائز اللعب",
    fields: [
      {
        key: "gameplayPillars",
        label: "ركائز اللعب",
        type: "list",
        wide: true,
        itemFields: [
          { key: "title", label: "العنوان", type: "text" },
          { key: "description", label: "الشرح", type: "textarea" },
          { key: "imageUrl", label: "صورة", type: "image" },
        ],
      },
    ],
  },
  {
    id: "story",
    label: "القصة وعالم اللعبة",
    sectionTitle: "القصة وعالم اللعبة",
    fields: [
      { key: "worldSummary", label: "ملخص عالم اللعبة", type: "textarea", wide: true },
      {
        key: "storyChapters",
        label: "فصول القصة",
        type: "list",
        wide: true,
        itemFields: [
          { key: "title", label: "العنوان", type: "text" },
          { key: "body", label: "النص", type: "textarea" },
          { key: "imageUrl", label: "صورة", type: "image" },
        ],
      },
    ],
  },
  {
    id: "videos",
    label: "قائمة الفيديو",
    sectionTitle: "قائمة الفيديو",
    fields: [
      {
        key: "videos",
        label: "الفيديوهات",
        type: "list",
        wide: true,
        itemFields: [
          { key: "title", label: "العنوان", type: "text" },
          { key: "url", label: "رابط يوتيوب", type: "url" },
        ],
      },
    ],
  },
  {
    id: "gallery",
    label: "معرض الصور",
    sectionTitle: "معرض الصور",
    fields: [
      {
        key: "galleryImages",
        label: "الصور",
        type: "list",
        wide: true,
        itemFields: [
          { key: "url", label: "الصورة", type: "image" },
          { key: "alt", label: "وصف الصورة", type: "text" },
        ],
      },
    ],
  },
  {
    id: "performance",
    label: "الأداء",
    sectionTitle: "الأداء",
    fields: [
      { key: "perfResolutionDocked", label: "الدقة (تلفاز)", type: "text" },
      { key: "perfResolutionHandheld", label: "الدقة (محمول)", type: "text" },
      { key: "perfFps", label: "الإطارات في الثانية", type: "text" },
      { key: "perfHdr", label: "هل يدعم HDR", type: "bool" },
      { key: "perfNotes", label: "ملاحظات الأداء", type: "textarea", wide: true },
    ],
  },
  {
    id: "storage",
    label: "الحجم والتخزين",
    sectionTitle: "الحجم والتخزين",
    fields: [
      { key: "downloadSizeGb", label: "حجم التنزيل (GB)", type: "number" },
      { key: "requiredSpaceGb", label: "المساحة المطلوبة (GB)", type: "number" },
      { key: "microSdRecommended", label: "هل ينصح ببطاقة microSD", type: "bool" },
      { key: "storageNotes", label: "ملاحظات التخزين", type: "textarea", wide: true },
    ],
  },
  {
    id: "languages",
    label: "اللغات",
    sectionTitle: "اللغات",
    fields: [
      { key: "languagesAudio", label: "لغات الصوت", type: "text", wide: true },
      { key: "languagesText", label: "لغات النصوص", type: "text", wide: true },
      { key: "arabicSupport", label: "هل يدعم العربية", type: "bool" },
    ],
  },
  {
    id: "multiplayer",
    label: "اللعب الجماعي",
    sectionTitle: "اللعب الجماعي",
    fields: [
      { key: "mpLocalPlayers", label: "محلياً", type: "text" },
      { key: "mpOnlinePlayers", label: "أونلاين", type: "text" },
      { key: "mpCoop", label: "تعاوني", type: "bool" },
      { key: "mpCompetitive", label: "تنافسي", type: "bool" },
      { key: "mpSplitScreen", label: "شاشة مقسومة", type: "bool" },
      { key: "mpLocalWireless", label: "العب لاسلكي محلي", type: "bool" },
    ],
  },
  {
    id: "dlc",
    label: "DLC",
    sectionTitle: "DLC",
    fields: [
      {
        key: "dlc",
        label: "الإضافات",
        type: "list",
        wide: true,
        itemFields: [
          { key: "name", label: "عنوان", type: "text" },
          { key: "description", label: "وصف", type: "textarea" },
          { key: "coverUrl", label: "صوره", type: "image" },
        ],
      },
    ],
  },
  {
    id: "guides",
    label: "الأدلة",
    sectionTitle: "الأدلة",
    fields: [
      {
        key: "guides",
        label: "الأدلة",
        type: "list",
        wide: true,
        itemFields: [
          { key: "title", label: "العنوان", type: "text" },
          { key: "summary", label: "الملخص", type: "textarea" },
          { key: "url", label: "الرابط", type: "url" },
        ],
      },
    ],
  },
  {
    id: "completion",
    label: "نسبة الإكمال",
    sectionTitle: "نسبة الإكمال",
    fields: [
      { key: "completionMain", label: "القصة الرئيسية (ساعة)", type: "number" },
      { key: "completionExtras", label: "القصة + الإضافات (ساعة)", type: "number" },
      { key: "completionAll", label: "إكمال 100% (ساعة)", type: "number" },
    ],
  },
  {
    id: "faq",
    label: "الأسئلة الشائعة",
    sectionTitle: "الأسئلة الشائعة",
    fields: [
      {
        key: "faq",
        label: "الأسئلة",
        type: "list",
        wide: true,
        itemFields: [
          { key: "q", label: "السؤال", type: "text" },
          { key: "a", label: "الجواب", type: "textarea" },
        ],
      },
    ],
  },
  {
    id: "verdict",
    label: "الحكم النهائي",
    sectionTitle: "الحكم النهائي",
    fields: [
      { key: "verdictScore", label: "الدرجة من 10", type: "number" },
      { key: "verdictSummary", label: "الخلاصة", type: "textarea", wide: true },
      { key: "verdictPros", label: "الإيجابيات", type: "list", wide: true },
      { key: "verdictCons", label: "السلبيات", type: "list", wide: true },
    ],
  },
  {
    id: "reviews",
    label: "المراجعات",
    sectionTitle: "المراجعات",
    fields: [
      { key: "opencriticRating", label: "تقييم Opencritic", type: "number" },
      {
        key: "reviews",
        label: "مراجعات مختارة",
        type: "list",
        wide: true,
        itemFields: [
          { key: "source", label: "المصدر", type: "text" },
          { key: "score", label: "الدرجة", type: "text" },
          { key: "quote", label: "الاقتباس", type: "textarea" },
          { key: "url", label: "الرابط", type: "url" },
        ],
      },
    ],
  },
  {
    id: "timeline",
    label: "الخط الزمني الأحدات",
    sectionTitle: "الخط الزمني الأحدات",
    fields: [
      {
        key: "timeline",
        label: "الأحداث",
        type: "list",
        wide: true,
        itemFields: [
          { key: "date", label: "التاريخ", type: "text" },
          { key: "title", label: "العنوان", type: "text" },
          { key: "body", label: "التفاصيل", type: "textarea" },
        ],
      },
    ],
  },
  {
    id: "patches",
    label: "التحديثات",
    sectionTitle: "التحديثات",
    fields: [
      {
        key: "patchNotes",
        label: "التحديثات",
        type: "list",
        wide: true,
        itemFields: [
          { key: "version", label: "الاصدار", type: "text" },
          { key: "date", label: "التاريخ", type: "text" },
          { key: "body", label: "التغييرات", type: "textarea" },
        ],
      },
    ],
  },
  {
    id: "soundtrack",
    label: "الموسيقى",
    sectionTitle: "الموسيقى",
    fields: [
      {
        key: "soundtrack",
        label: "الموسيقى",
        type: "list",
        wide: true,
        itemFields: [
          { key: "title", label: "العنوان", type: "text" },
          { key: "url", label: "الرابط", type: "url" },
        ],
      },
    ],
  },
  {
    id: "similar",
    label: "ألعاب مشابهة",
    sectionTitle: "ألعاب مشابهة",
    fields: [
      {
        key: "similarIds",
        label: "معرفات الألعاب المشابهة",
        type: "text",
        wide: true,
        hint: "تتم تلقائي عن طريق الخوارزمية بنفس تصنيف الانواع",
      },
    ],
  },
  {
    id: "series",
    label: "السلسلة",
    sectionTitle: "السلسلة",
    fields: [
      { key: "seriesName", label: "اسم السلسلة", type: "text" },
      { key: "seriesEntries", label: "أجزاء السلسلة", type: "list", wide: true },
    ],
  },
  {
    id: "studio",
    label: "الاستوديو",
    sectionTitle: "الاستوديو",
    fields: [
      { key: "studioName", label: "اسم الاستوديو", type: "text" },
      { key: "studioUrl", label: "الموقع", type: "url" },
      { key: "studioLocation", label: "المقر", type: "text" },
      { key: "studioAbout", label: "نبذة", type: "textarea", wide: true },
    ],
  },
  {
    id: "setup",
    label: "الإعداد",
    sectionTitle: "الإعداد",
    fields: [{ key: "setupNeeds", label: "المتطلبات", type: "list", wide: true }],
  },
  {
    id: "sources",
    label: "المصادر",
    sectionTitle: "المصادر",
    fields: [
      {
        key: "dataSources",
        label: "المصادر",
        type: "list",
        wide: true,
        itemFields: [
          { key: "source", label: "المصدر", type: "text" },
          { key: "url", label: "الرابط", type: "url" },
        ],
      },
    ],
  },
];

export const HUB_GROUP_BY_ID = new Map(HUB_GROUPS.map((g) => [g.id, g]));
