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
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const CONNECTIVITY = "الاتصال والمنافذ";
const POWER = "الطاقة والبطارية";
const PERFORMANCE = "الأداء";
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
  f.str("box_contents_text", "boxContentsText", "محتويات العلبة كنص واحد مفصول بفواصل", {
    group: CONSOLE,
  }),
  f.str("ports_connectivity", "connectivity", "المنافذ والاتصال (Ports & Connectivity)", {
    specKey: "connectivity",
    group: CONSOLE,
  }),
];

export const HARDWARE_SCHEMA: ProductSchema = {
  id: "hardware",
  version: 1,
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
    ...connectivity,
    ...power,
    ...requirements,
    ...physicalFields(),
    specGroupField(),
    compatibilityField("التوافق مع الأجهزة والمنصات (Nintendo Switch، PC، PlayStation…)"),
    boxContentField(),
    ...mediaFields(),
    ...optionFields(),
    ...socialProofFields(),
    updateField(),
    relatedField(),
    sourceField(),
    ...seoFields(),
  ],
};
