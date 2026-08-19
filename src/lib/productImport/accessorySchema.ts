/**
 * Accessories import schema.
 *
 * "Accessory" spans a controller, a 100 W charger and a screen protector, so a
 * single flat field list would be mostly noise for any one product. Fields that
 * only make sense for one family carry `showFor`, keyed off `accessory_type`:
 * the template groups them under clear headings, the admin form can hide the
 * irrelevant ones, and importing a controller field on a cable produces a
 * warning rather than silent nonsense.
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

export const ACCESSORY_TYPE_VALUES = [
  "controller",
  "charger",
  "cable",
  "case",
  "cover",
  "screen_protector",
  "dock",
  "stand",
  "grip",
  "headset",
  "adapter",
  "storage",
  "travel_bag",
  "camera",
  "keyboard",
  "mouse",
  "battery",
  "cooling",
  "replacement_part",
  "other",
] as const;

const CONNECTION = "الاتصال";
const POWER = "الطاقة";

const connection: FieldDef[] = [
  f.bool("wired", "wired", "سلكي (true/false)", { specKey: "wired", group: CONNECTION }),
  f.bool("wireless", "wireless", "لاسلكي (true/false)", { specKey: "wireless", group: CONNECTION }),
  f.str("bluetooth_version", "bluetoothVersion", "إصدار Bluetooth", {
    specKey: "bluetoothVersion",
    group: CONNECTION,
  }),
  f.bool("wifi", "wifi", "يدعم Wi-Fi (true/false)", { specKey: "wifi", group: CONNECTION }),
  f.bool("nfc", "nfc", "يدعم NFC (true/false)", { specKey: "nfc", group: CONNECTION }),
  f.str("usb", "usb", "منفذ USB", { specKey: "usb", group: CONNECTION }),
  f.str("usb_c", "usbC", "منفذ USB-C", { specKey: "usbC", group: CONNECTION }),
  f.bool("wireless_2_4ghz", "wireless24Ghz", "يدعم 2.4 GHz (true/false)", {
    specKey: "wireless24Ghz",
    group: CONNECTION,
  }),
  f.str("connector", "connector", "نوع الموصّل", { specKey: "connector", group: CONNECTION }),
  f.str("cable_length", "cableLength", "طول الكابل", {
    specKey: "cableLength",
    unit: "m",
    group: CONNECTION,
  }),
];

const power: FieldDef[] = [
  f.bool("has_battery", "hasBattery", "يحتوي بطارية (true/false)", {
    specKey: "hasBattery",
    group: POWER,
  }),
  f.num("battery_capacity", "batteryCapacity", "سعة البطارية", {
    unit: "mAh",
    specKey: "batteryCapacity",
    group: POWER,
  }),
  f.str("battery_life", "batteryLife", "عمر البطارية", { specKey: "batteryLife", group: POWER }),
  f.str("charging_time", "chargingTime", "زمن الشحن", { specKey: "chargingTime", group: POWER }),
  f.str("charging_connector", "chargingConnector", "موصّل الشحن", {
    specKey: "chargingConnector",
    group: POWER,
  }),
  f.str("power_input", "powerInput", "الدخل", { specKey: "powerInput", group: POWER }),
  f.str("power_output", "powerOutput", "الخرج", { specKey: "powerOutput", group: POWER }),
  f.num("wattage", "wattage", "القدرة", { unit: "W", specKey: "wattage", group: POWER }),
  f.bool("fast_charging", "fastCharging", "شحن سريع (true/false)", {
    specKey: "fastCharging",
    group: POWER,
  }),
  f.bool("power_delivery", "powerDelivery", "يدعم USB Power Delivery (true/false)", {
    specKey: "powerDelivery",
    group: POWER,
  }),
];

/** Conditional blocks — each only applies to its own `accessory_type`. */

const controller: FieldDef[] = [
  f.str("buttons", "buttons", "الأزرار", { specKey: "buttons" }),
  f.str("analog_sticks", "analogSticks", "عصي التحكم", { specKey: "analogSticks" }),
  f.bool("hall_effect", "hallEffect", "عصي Hall Effect (true/false)", { specKey: "hallEffect" }),
  f.bool("tmr_sticks", "tmrSticks", "عصي TMR (true/false)", { specKey: "tmrSticks" }),
  f.bool("gyroscope", "gyroscope", "جيروسكوب (true/false)", { specKey: "gyroscope" }),
  f.bool("accelerometer", "accelerometer", "مقياس تسارع (true/false)", {
    specKey: "accelerometer",
  }),
  f.bool("motion_controls", "motionControls", "تحكم بالحركة (true/false)", {
    specKey: "motionControls",
  }),
  f.bool("vibration", "vibration", "اهتزاز (true/false)", { specKey: "vibration" }),
  f.bool("hd_rumble", "hdRumble", "HD Rumble (true/false)", { specKey: "hdRumble" }),
  f.bool("headphone_jack", "headphoneJack", "مخرج سماعة (true/false)", {
    specKey: "headphoneJack",
  }),
  f.str("back_buttons", "backButtons", "أزرار خلفية", { specKey: "backButtons" }),
  f.str("trigger_type", "triggerType", "نوع الزناد", { specKey: "triggerType" }),
  f.bool("trigger_stops", "triggerStops", "مصدّات الزناد (true/false)", {
    specKey: "triggerStops",
  }),
  f.bool("macro_support", "macroSupport", "دعم الماكرو (true/false)", { specKey: "macroSupport" }),
  f.bool("turbo", "turbo", "خاصية التيربو (true/false)", { specKey: "turbo" }),
  f.str("polling_rate", "pollingRate", "معدل الاستقصاء", { unit: "Hz", specKey: "pollingRate" }),
  f.str("input_latency", "inputLatency", "زمن استجابة الإدخال", {
    unit: "ms",
    specKey: "inputLatency",
  }),
].map((def) => ({ ...def, showFor: ["controller"], group: "خاص بأذرع التحكم" }));

const storage: FieldDef[] = [
  f.str("capacity", "capacity", "السعة", { specKey: "capacity" }),
  f.str("storage_type", "storageType", "نوع التخزين (microSD، SSD…)", { specKey: "storageType" }),
  f.str("interface", "interface", "الواجهة", { specKey: "interface" }),
  f.str("read_speed", "readSpeed", "سرعة القراءة", { specKey: "readSpeed" }),
  f.str("write_speed", "writeSpeed", "سرعة الكتابة", { specKey: "writeSpeed" }),
  f.str("speed_class", "speedClass", "فئة السرعة", { specKey: "speedClass" }),
  f.str("uhs_class", "uhsClass", "فئة UHS", { specKey: "uhsClass" }),
  f.str("application_class", "applicationClass", "فئة التطبيقات (A1/A2)", {
    specKey: "applicationClass",
  }),
].map((def) => ({ ...def, showFor: ["storage"], group: "خاص بوسائط التخزين" }));

const charger: FieldDef[] = [
  f.num("maximum_wattage", "maximumWattage", "أقصى قدرة", { unit: "W", specKey: "maximumWattage" }),
  f.bool("usb_pd", "usbPd", "يدعم USB PD (true/false)", { specKey: "usbPd" }),
  f.bool("gan", "gan", "تقنية GaN (true/false)", { specKey: "gan" }),
  {
    key: "port_count",
    type: "integer" as const,
    target: "portCount",
    description: "عدد المنافذ",
    specKey: "portCount",
  },
  f.str("port_wattage", "portWattage", "قدرة كل منفذ", { specKey: "portWattage" }),
  f.str("plug_type", "plugType", "نوع القابس", { specKey: "plugType" }),
  f.bool("cable_included", "cableIncluded", "يتضمن كابلاً (true/false)", {
    specKey: "cableIncluded",
  }),
].map((def) => ({ ...def, showFor: ["charger"], group: "خاص بالشواحن" }));

const cable: FieldDef[] = [
  f.str("connector_a", "connectorA", "الموصّل الأول", { specKey: "connectorA" }),
  f.str("connector_b", "connectorB", "الموصّل الثاني", { specKey: "connectorB" }),
  f.str("data_speed", "dataSpeed", "سرعة نقل البيانات", { specKey: "dataSpeed" }),
  f.num("charging_wattage", "chargingWattage", "قدرة الشحن", {
    unit: "W",
    specKey: "chargingWattage",
  }),
  f.bool("braided", "braided", "مجدول (true/false)", { specKey: "braided" }),
  f.bool("video_support", "videoSupport", "يدعم نقل الفيديو (true/false)", {
    specKey: "videoSupport",
  }),
  f.str("resolution_support", "resolutionSupport", "الدقة المدعومة", {
    specKey: "resolutionSupport",
  }),
].map((def) => ({ ...def, showFor: ["cable"], group: "خاص بالكابلات" }));

const caseFields: FieldDef[] = [
  f.str("compatible_device", "compatibleDevice", "الجهاز المتوافق", {
    specKey: "compatibleDevice",
  }),
  f.str("protection_type", "protectionType", "نوع الحماية", { specKey: "protectionType" }),
  f.str("drop_protection", "dropProtection", "الحماية من السقوط", { specKey: "dropProtection" }),
  f.str("water_resistance", "waterResistance", "مقاومة الماء", { specKey: "waterResistance" }),
  f.str("dust_protection", "dustProtection", "الحماية من الغبار", { specKey: "dustProtection" }),
  f.str("interior_material", "interiorMaterial", "خامة البطانة الداخلية", {
    specKey: "interiorMaterial",
  }),
  {
    key: "compartments",
    type: "integer" as const,
    target: "compartments",
    description: "عدد الجيوب",
    specKey: "compartments",
  },
  {
    key: "game_card_slots",
    type: "integer" as const,
    target: "gameCardSlots",
    description: "عدد فتحات أشرطة الألعاب",
    specKey: "gameCardSlots",
  },
  f.bool("accessory_storage", "accessoryStorage", "مساحة للإكسسوارات (true/false)", {
    specKey: "accessoryStorage",
  }),
  f.bool("handle", "handle", "مقبض (true/false)", { specKey: "handle" }),
  f.bool("shoulder_strap", "shoulderStrap", "حزام كتف (true/false)", { specKey: "shoulderStrap" }),
].map((def) => ({
  ...def,
  showFor: ["case", "cover", "travel_bag"],
  group: "خاص بالحقائب والأغطية",
}));

const screenProtector: FieldDef[] = [
  f.bool("tempered_glass", "temperedGlass", "زجاج مقوى (true/false)", { specKey: "temperedGlass" }),
  f.str("hardness", "hardness", "الصلابة (9H…)", { specKey: "hardness" }),
  f.str("thickness", "thickness", "السماكة", { unit: "mm", specKey: "thickness" }),
  f.str("transparency", "transparency", "نسبة الشفافية", { specKey: "transparency" }),
  f.bool("anti_reflection", "antiReflection", "مضاد للانعكاس (true/false)", {
    specKey: "antiReflection",
  }),
  f.bool("anti_fingerprint", "antiFingerprint", "مضاد للبصمات (true/false)", {
    specKey: "antiFingerprint",
  }),
  f.bool("privacy_filter", "privacyFilter", "فلتر خصوصية (true/false)", {
    specKey: "privacyFilter",
  }),
  f.bool("installation_kit", "installationKit", "طقم تركيب مرفق (true/false)", {
    specKey: "installationKit",
  }),
].map((def) => ({ ...def, showFor: ["screen_protector"], group: "خاص بواقيات الشاشة" }));

const headset: FieldDef[] = [
  f.str("driver_size", "driverSize", "قياس السماعة", { unit: "mm", specKey: "driverSize" }),
  f.str("frequency_response", "frequencyResponse", "استجابة التردد", {
    specKey: "frequencyResponse",
  }),
  f.str("impedance", "impedance", "الممانعة", { specKey: "impedance" }),
  f.str("sensitivity", "sensitivity", "الحساسية", { specKey: "sensitivity" }),
  f.str("microphone", "microphone", "الميكروفون", { specKey: "microphone" }),
  f.str("surround_sound", "surroundSound", "الصوت المحيطي", { specKey: "surroundSound" }),
  f.bool("noise_cancellation", "noiseCancellation", "إلغاء الضوضاء (true/false)", {
    specKey: "noiseCancellation",
  }),
].map((def) => ({ ...def, showFor: ["headset"], group: "خاص بالسماعات" }));

export const ACCESSORY_SCHEMA: ProductSchema = {
  id: "accessory",
  version: 1,
  label: "الإكسسوارات",
  labelKey: "category.accessories",
  categoryId: "cat_accessories",
  kind: "accessory",
  templateFile: "accessory-product-template.txt",
  conditionalOn: "accessory_type",
  fields: [
    ...identityFields("اسم الإكسسوار"),
    {
      key: "accessory_type",
      type: "enum",
      target: "accessoryType",
      required: true,
      enumValues: ACCESSORY_TYPE_VALUES,
      description: `نوع الإكسسوار — يحدد الحقول الظاهرة: ${ACCESSORY_TYPE_VALUES.join(" / ")}`,
      group: "الأساسيات",
    },
    ...warrantyFields(),
    ...descriptionFields(),
    compatibilityField("التوافق — أهم معلومة في الإكسسوارات؛ اربطها بمنتجات المتجر عبر product_id"),
    ...connection,
    ...power,
    ...controller,
    ...storage,
    ...charger,
    ...cable,
    ...caseFields,
    ...screenProtector,
    ...headset,
    ...physicalFields(),
    specGroupField(),
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
