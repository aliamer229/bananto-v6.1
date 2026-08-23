/**
 * Hardware & Peripherals import schema.
 *
 * Covers well over 120 distinct pieces of information across identity, pricing,
 * description, power, connectivity, performance, requirements, physical
 * measurements, media, warranty and sourcing — and on top of that accepts an
 * unbounded number of dynamic specification groups, so a spec we did not think
 * of today needs no code change and no migration tomorrow.
 */

import {
  boxContentField,
  compatibilityField,
  descriptionFields,
  f,
  identityFields,
  mediaFields,
  optionFields,
  physicalFields,
  relatedField,
  seoFields,
  socialProofFields,
  sourceField,
  specGroupField,
  updateField,
  warrantyFields,
  setupStepsFields,
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const CONNECTIVITY = "الاتصال والمنافذ";
const POWER = "الطاقة والبطارية";
const PERFORMANCE = "الأداء";
const DISPLAY = "الشاشة والرسوميات";
const STORAGE = "التخزين";
const GAMING = "قدرات الألعاب";
const REQUIREMENTS = "المتطلبات";

const connectivity: FieldDef[] = [
  f.bool("wifi", "wifi", "يدعم Wi-Fi (true/false)", { specKey: "wifi", group: CONNECTIVITY }),
  f.str("wifi_standard", "wifiStandard", "معيار Wi-Fi (Wi-Fi 6، 802.11ax…)", {
    specKey: "wifiStandard",
    group: CONNECTIVITY,
  }),
  f.str("wifi_bands", "wifiBands", "نطاقات Wi-Fi (2.4GHz / 5GHz / 6GHz)", {
    specKey: "wifiBands",
    group: CONNECTIVITY,
  }),
  f.bool("bluetooth", "bluetooth", "يدعم Bluetooth (true/false)", {
    specKey: "bluetooth",
    group: CONNECTIVITY,
  }),
  f.str("bluetooth_version", "bluetoothVersion", "إصدار Bluetooth", {
    specKey: "bluetoothVersion",
    group: CONNECTIVITY,
  }),
  f.str("ethernet", "ethernet", "منفذ الإيثرنت وسرعته", {
    specKey: "ethernet",
    group: CONNECTIVITY,
  }),
  f.str("usb", "usb", "منافذ USB", { specKey: "usb", group: CONNECTIVITY }),
  f.str("usb_c", "usbC", "منافذ USB-C", { specKey: "usbC", group: CONNECTIVITY }),
  f.str("hdmi", "hdmi", "منفذ HDMI وإصداره", { specKey: "hdmi", group: CONNECTIVITY }),
  f.str("displayport", "displayPort", "منفذ DisplayPort", {
    specKey: "displayPort",
    group: CONNECTIVITY,
  }),
  f.str("thunderbolt", "thunderbolt", "منفذ Thunderbolt", {
    specKey: "thunderbolt",
    group: CONNECTIVITY,
  }),
  f.str("audio_jack", "audioJack", "مخرج الصوت", { specKey: "audioJack", group: CONNECTIVITY }),
  f.bool("nfc", "nfc", "يدعم NFC (true/false)", { specKey: "nfc", group: CONNECTIVITY }),
  {
    key: "wireless_protocol",
    type: "string",
    target: "wirelessProtocols",
    repeatable: true,
    templateCount: 3,
    description: "بروتوكولات لاسلكية إضافية (2.4GHz، Zigbee…)",
    group: CONNECTIVITY,
  },
  {
    key: "port",
    type: "group",
    target: "ports",
    repeatable: true,
    templateCount: 4,
    description: "المنافذ بالتفصيل (عدد غير محدود)",
    group: CONNECTIVITY,
    itemFields: {
      type: f.str("type", "type", "نوع المنفذ (USB-C، HDMI…)"),
      version: f.str("version", "version", "الإصدار"),
      count: {
        key: "count",
        type: "integer",
        target: "count",
        description: "العدد",
        validation: { min: 0 },
      },
      notes: f.str("notes", "notes", "ملاحظات"),
    },
  },
];

const power: FieldDef[] = [
  f.str("input_voltage", "inputVoltage", "جهد الدخل", {
    specKey: "inputVoltage",
    unit: "V",
    group: POWER,
  }),
  f.str("input_frequency", "inputFrequency", "تردد الدخل", {
    specKey: "inputFrequency",
    unit: "Hz",
    group: POWER,
  }),
  f.str("rated_voltage", "ratedVoltage", "الجهد الاسمي", {
    specKey: "ratedVoltage",
    unit: "V",
    group: POWER,
  }),
  f.num("power_consumption", "powerConsumption", "استهلاك الطاقة", {
    specKey: "powerConsumption",
    unit: "W",
    group: POWER,
  }),
  f.num("maximum_power", "maximumPower", "أقصى استهلاك", {
    specKey: "maximumPower",
    unit: "W",
    group: POWER,
  }),
  f.num("standby_power", "standbyPower", "استهلاك وضع الاستعداد", {
    specKey: "standbyPower",
    unit: "W",
    group: POWER,
  }),
  f.str("power_adapter", "powerAdapter", "محول الطاقة المرفق", {
    specKey: "powerAdapter",
    group: POWER,
  }),
  f.str("psu_requirement", "psuRequirement", "متطلبات مزود الطاقة", {
    specKey: "psuRequirement",
    group: POWER,
  }),
  f.num("battery_capacity", "batteryCapacity", "سعة البطارية", {
    specKey: "batteryCapacity",
    unit: "mAh",
    group: POWER,
  }),
  f.str("battery_type", "batteryType", "نوع البطارية", { specKey: "batteryType", group: POWER }),
  f.str("charging_time", "chargingTime", "زمن الشحن", { specKey: "chargingTime", group: POWER }),
  f.str("runtime", "runtime", "مدة التشغيل على البطارية", { specKey: "runtime", group: POWER }),
  f.str("connector_type", "connectorType", "نوع الموصّل", {
    specKey: "connectorType",
    group: POWER,
  }),
];

const performance: FieldDef[] = [
  f.str("benchmark", "benchmark", "نتيجة قياس الأداء", {
    specKey: "benchmark",
    group: PERFORMANCE,
  }),
  f.str("speed", "speed", "السرعة", { specKey: "speed", group: PERFORMANCE }),
  f.str("latency", "latency", "زمن الاستجابة", {
    specKey: "latency",
    unit: "ms",
    group: PERFORMANCE,
  }),
  f.str("resolution", "resolution", "الدقة", { specKey: "resolution", group: PERFORMANCE }),
  f.str("refresh_rate", "refreshRate", "معدل التحديث", {
    specKey: "refreshRate",
    unit: "Hz",
    group: PERFORMANCE,
  }),
  f.str("fps", "fps", "الإطارات في الثانية", { specKey: "fps", unit: "fps", group: PERFORMANCE }),
  f.str("throughput", "throughput", "معدل النقل", { specKey: "throughput", group: PERFORMANCE }),
  f.str("read_speed", "readSpeed", "سرعة القراءة", { specKey: "readSpeed", group: PERFORMANCE }),
  f.str("write_speed", "writeSpeed", "سرعة الكتابة", { specKey: "writeSpeed", group: PERFORMANCE }),
  f.str("response_time", "responseTime", "زمن الاستجابة للشاشة", {
    specKey: "responseTime",
    unit: "ms",
    group: PERFORMANCE,
  }),
  f.str("accuracy", "accuracy", "الدقة/الضبط", { specKey: "accuracy", group: PERFORMANCE }),
  f.str("noise_level", "noiseLevel", "مستوى الضجيج", {
    specKey: "noiseLevel",
    unit: "dB",
    group: PERFORMANCE,
  }),
  f.str("operating_temperature", "operatingTemperature", "درجة حرارة التشغيل", {
    specKey: "operatingTemperature",
    group: PERFORMANCE,
  }),
  {
    key: "performance_mode",
    type: "string",
    target: "performanceModes",
    repeatable: true,
    templateCount: 3,
    description: "أنماط الأداء",
    group: PERFORMANCE,
  },
  f.str("display_size", "displaySize", "مقاس الشاشة", {
    specKey: "displaySize",
    unit: "inch",
    group: PERFORMANCE,
  }),
  f.str("display_type", "displayType", "نوع الشاشة (LCD، OLED…)", {
    specKey: "displayType",
    group: PERFORMANCE,
  }),
  f.str("processor", "processor", "المعالج", { specKey: "processor", group: PERFORMANCE }),
  f.str("cpu", "cpu", "وحدة المعالجة المركزية", { specKey: "cpu", group: PERFORMANCE }),
  f.str("gpu", "gpu", "معالج الرسوميات", { specKey: "gpu", group: PERFORMANCE }),
  f.str("memory", "memory", "الذاكرة RAM", { specKey: "memory", group: PERFORMANCE }),
  f.str("storage_capacity", "storageCapacity", "سعة التخزين", {
    specKey: "storageCapacity",
    group: PERFORMANCE,
  }),
  f.str("expandable_storage", "expandableStorage", "التخزين القابل للتوسعة", {
    specKey: "expandableStorage",
    group: PERFORMANCE,
  }),
  f.str("cooling", "cooling", "نظام التبريد", { specKey: "cooling", group: PERFORMANCE }),
  f.str("audio_output", "audioOutput", "مخرجات الصوت", {
    specKey: "audioOutput",
    group: PERFORMANCE,
  }),
  {
    key: "sensor",
    type: "string",
    target: "sensors",
    repeatable: true,
    templateCount: 3,
    description: "الحساسات",
    group: PERFORMANCE,
  },
];

const displayAndProcessor: FieldDef[] = [
  f.str("native_resolution", "nativeResolution", "الدقة الأصلية للشاشة", {
    specKey: "nativeResolution",
    group: DISPLAY,
  }),
  f.str("panel_type", "panelType", "نوع لوحة الشاشة", { specKey: "panelType", group: DISPLAY }),
  f.bool("touch_support", "touchSupport", "دعم اللمس (true/false)", {
    specKey: "touchSupport",
    group: DISPLAY,
  }),
  f.bool("hdr", "hdr", "دعم HDR للشاشة", { specKey: "hdr", group: DISPLAY }),
  f.str("hdr_format", "hdrFormat", "صيغة HDR (HDR10، Dolby Vision…)", {
    specKey: "hdrFormat",
    group: DISPLAY,
  }),
  f.bool("vrr", "vrr", "دعم VRR للشاشة", { specKey: "vrr", group: DISPLAY }),
  f.str("vrr_range", "vrrRange", "نطاق VRR", { specKey: "vrrRange", group: DISPLAY }),
  f.str("maximum_handheld_fps", "maximumHandheldFps", "أقصى FPS في الوضع المحمول", {
    specKey: "maximumHandheldFps",
    group: DISPLAY,
  }),
  f.str("tv_max_resolution", "tvMaxResolution", "أقصى دقة خرج للتلفاز", {
    specKey: "tvMaxResolution",
    group: DISPLAY,
  }),
  f.str("tv_max_refresh_rate", "tvMaxRefreshRate", "أقصى معدل تحديث للتلفاز", {
    specKey: "tvMaxRefreshRate",
    group: DISPLAY,
  }),
  f.str("tv_max_fps", "tvMaxFps", "أقصى FPS لخرج التلفاز", {
    specKey: "tvMaxFps",
    group: DISPLAY,
  }),
  f.bool("tv_hdr", "tvHdr", "دعم HDR في خرج التلفاز", { specKey: "tvHdr", group: DISPLAY }),
  f.bool("tv_vrr", "tvVrr", "دعم VRR في خرج التلفاز", { specKey: "tvVrr", group: DISPLAY }),
  f.str("hdmi_version", "hdmiVersion", "إصدار HDMI لخرج التلفاز", {
    specKey: "hdmiVersion",
    group: DISPLAY,
  }),
  f.text("tv_output_notes", "tvOutputNotes", "ملاحظات خرج التلفاز", { group: DISPLAY }),
  {
    key: "supported_output_resolution",
    type: "string",
    target: "supportedOutputResolutions",
    repeatable: true,
    templateCount: 3,
    description: "الدقات المدعومة للخرج (عدد غير محدود)",
    group: DISPLAY,
  },
  {
    key: "supported_frame_rate",
    type: "string",
    target: "supportedFrameRates",
    repeatable: true,
    templateCount: 3,
    description: "معدلات الإطارات المدعومة (عدد غير محدود)",
    group: DISPLAY,
  },
  f.str("soc", "soc", "SoC / المعالج الرئيسي", { specKey: "soc", group: PERFORMANCE }),
  f.str("cpu_architecture", "cpuArchitecture", "معمارية CPU", {
    specKey: "cpuArchitecture",
    group: PERFORMANCE,
  }),
  f.str("cpu_cores", "cpuCores", "أنوية CPU", { specKey: "cpuCores", group: PERFORMANCE }),
  f.str("gpu_architecture", "gpuArchitecture", "معمارية GPU", {
    specKey: "gpuArchitecture",
    group: PERFORMANCE,
  }),
  f.str("gpu_cores", "gpuCores", "أنوية GPU", { specKey: "gpuCores", group: PERFORMANCE }),
  f.str("ram", "ram", "سعة RAM", { specKey: "ram", group: PERFORMANCE }),
  f.str("ram_type", "ramType", "نوع RAM", { specKey: "ramType", group: PERFORMANCE }),
  f.str("memory_bandwidth", "memoryBandwidth", "عرض نطاق الذاكرة", {
    specKey: "memoryBandwidth",
    group: PERFORMANCE,
  }),
  f.str("storage_type", "storageType", "تقنية/نوع التخزين", {
    specKey: "storageType",
    group: STORAGE,
  }),
  f.str("internal_storage", "internalStorage", "التخزين الداخلي", {
    specKey: "internalStorage",
    group: STORAGE,
  }),
  f.str("usable_storage", "usableStorage", "المساحة القابلة للاستخدام", {
    specKey: "usableStorage",
    group: STORAGE,
  }),
  f.str("storage_card_type", "storageCardType", "نوع بطاقة التخزين المدعومة", {
    specKey: "storageCardType",
    group: STORAGE,
  }),
  f.str("storage_max_capacity", "storageMaxCapacity", "أقصى سعة توسعة", {
    specKey: "storageMaxCapacity",
    group: STORAGE,
  }),
  f.text("game_storage_notes", "gameStorageNotes", "ملاحظات تثبيت وتخزين الألعاب", {
    group: STORAGE,
  }),
];

const gamingCapabilities: FieldDef[] = [
  f.str("handheld_max_resolution", "handheldMaxResolution", "أقصى دقة في الوضع المحمول", {
    group: GAMING,
  }),
  f.str("handheld_max_refresh_rate", "handheldMaxRefreshRate", "أقصى تحديث محمول", {
    group: GAMING,
  }),
  f.str("handheld_max_fps", "handheldMaxFps", "أقصى FPS محمول", { group: GAMING }),
  f.bool("handheld_hdr", "handheldHdr", "HDR في الوضع المحمول", { group: GAMING }),
  f.bool("handheld_vrr", "handheldVrr", "VRR في الوضع المحمول", { group: GAMING }),
  {
    key: "gaming_capability",
    type: "group",
    target: "gamingCapability",
    description: "القدرات القصوى للجهاز — لا تمثل أداء لعبة بعينها",
    group: GAMING,
    itemFields: {
      handheld: {
        key: "handheld",
        type: "group",
        target: "handheld",
        itemFields: {
          max_resolution: f.str("max_resolution", "maxResolution", "أقصى دقة"),
          max_refresh_rate: f.str("max_refresh_rate", "maxRefreshRate", "أقصى معدل تحديث"),
          max_fps: f.str("max_fps", "maxFps", "أقصى FPS"),
          hdr: f.bool("hdr", "hdr", "HDR"),
          vrr: f.bool("vrr", "vrr", "VRR"),
        },
      },
      tv: {
        key: "tv",
        type: "group",
        target: "tv",
        itemFields: {
          max_resolution: f.str("max_resolution", "maxResolution", "أقصى دقة"),
          max_refresh_rate: f.str("max_refresh_rate", "maxRefreshRate", "أقصى معدل تحديث"),
          max_fps: f.str("max_fps", "maxFps", "أقصى FPS"),
          hdr: f.bool("hdr", "hdr", "HDR"),
          vrr: f.bool("vrr", "vrr", "VRR"),
        },
      },
      ray_tracing: f.bool("ray_tracing", "rayTracing", "دعم Ray Tracing"),
      upscaling: {
        key: "upscaling",
        type: "string",
        target: "upscaling",
        repeatable: true,
        templateCount: 2,
        description: "تقنيات رفع الدقة",
      },
    },
  },
];

const componentDimensions: FieldDef = {
  key: "component_dimension",
  type: "group",
  target: "componentDimensions",
  repeatable: true,
  templateCount: 2,
  description: "أبعاد أجزاء الجهاز المستقلة مثل وحدات التحكم (عدد غير محدود)",
  group: "الأبعاد والوزن",
  itemFields: {
    name: f.str("name", "name", "اسم الجزء"),
    dimensions: f.str("dimensions", "dimensions", "الأبعاد"),
    weight: f.str("weight", "weight", "الوزن"),
    notes: f.str("notes", "notes", "ملاحظات"),
  },
};

const requirements: FieldDef[] = [
  f.text("minimum_requirements", "minimumRequirements", "الحد الأدنى للمتطلبات", {
    group: REQUIREMENTS,
  }),
  f.text("recommended_requirements", "recommendedRequirements", "المتطلبات الموصى بها", {
    group: REQUIREMENTS,
  }),
  f.str("operating_system", "operatingSystem", "أنظمة التشغيل المدعومة", {
    specKey: "operatingSystem",
    group: REQUIREMENTS,
  }),
  f.str("software", "software", "البرنامج المرافق", { specKey: "software", group: REQUIREMENTS }),
  f.str("drivers", "drivers", "التعريفات المطلوبة", { specKey: "drivers", group: REQUIREMENTS }),
  f.str("companion_app", "companionApp", "التطبيق المرافق", {
    specKey: "companionApp",
    group: REQUIREMENTS,
  }),
  f.str("firmware_version", "firmwareVersion", "إصدار البرنامج الثابت", {
    specKey: "firmwareVersion",
    group: REQUIREMENTS,
  }),
  f.bool("internet_required", "internetRequired", "يتطلب اتصال إنترنت (true/false)", {
    specKey: "internetRequired",
    group: REQUIREMENTS,
  }),
  f.bool("account_required", "accountRequired", "يتطلب حساباً (true/false)", {
    specKey: "accountRequired",
    group: REQUIREMENTS,
  }),
  f.str("certifications", "certifications", "الشهادات (CE، FCC…)", {
    specKey: "certifications",
    group: REQUIREMENTS,
  }),
];

const CONSOLE = "مواصفات الجهاز ومحتويات العلبة";

/**
 * The console panel in the admin editor (موديل الجهاز، اللون، الشاشة…) used to
 * have no counterpart in the import file, so those boxes stayed empty after an
 * import. These keys feed exactly the fields that panel edits.
 */
const consoleBasics: FieldDef[] = [
  f.str("hardware_model", "hardwareModel", "موديل الجهاز (Console / Model)", {
    specKey: "hardwareModel",
    group: CONSOLE,
  }),
  f.str("color_edition", "colorEdition", "اللون أو طبعة الإصدار (Color / Special Edition)", {
    specKey: "colorEdition",
    group: CONSOLE,
  }),
  f.str("screen_specs", "screenSpecs", "مواصفات الشاشة (Screen Specs)", {
    specKey: "screenSpecs",
    group: CONSOLE,
  }),
  f.str("battery_life", "batteryLife", "عمر وسعة البطارية (Battery Life & Capacity)", {
    specKey: "batteryLife",
    group: CONSOLE,
  }),
  f.str("warranty_condition", "warrantyCondition", "الضمان والحالة (Warranty & Guarantee)", {
    group: CONSOLE,
  }),
  // `boxContents` is already the repeatable `box_content.N` list target, so the
  // free-text variant lands on `boxContentsText`, which the console panel reads.
  f.str("box_contents_text", "boxContentsText", "محتويات العلبة كنص واحد مفصول بفواصل", {
    group: CONSOLE,
  }),
  f.url("box_package_art", "cartridgeImage", "صورة كرتون التغليف أو الملحقات (Box Package Art)", {
    group: CONSOLE,
  }),
  f.str("ports_connectivity", "connectivity", "المنافذ والاتصال (Ports & Connectivity)", {
    specKey: "connectivity",
    group: CONSOLE,
  }),
];

export const HARDWARE_SCHEMA: ProductSchema = {
  id: "hardware",
  version: 2,
  label: "الأجهزة والملحقات",
  labelKey: "category.hardware",
  categoryId: "cat_hardware",
  kind: "hardware",
  templateFile: "hardware-product-template.txt",
  fields: [
    ...identityFields("اسم الجهاز"),
    ...consoleBasics,
    ...warrantyFields(),
    ...descriptionFields(),
    ...performance,
    ...displayAndProcessor,
    ...gamingCapabilities,
    ...connectivity,
    ...power,
    ...requirements,
    ...physicalFields(),
    componentDimensions,
    specGroupField(),
    compatibilityField("التوافق مع الأجهزة والمنصات (Nintendo Switch، PC، PlayStation…)"),
    boxContentField(),
    ...setupStepsFields(),
    ...mediaFields(),
    ...optionFields(),
    ...socialProofFields(),
    updateField(),
    relatedField(),
    sourceField(),
    ...seoFields(),
  ],
};
