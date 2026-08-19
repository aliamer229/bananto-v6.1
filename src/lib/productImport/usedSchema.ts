/**
 * Used & pre-owned schema.
 *
 * The only questions that matter for a second-hand item are: what exactly is
 * being sold, what condition is it in, what is in the box, and what protection
 * the buyer gets. Everything here is written for that, not for spec sheets.
 */

import {
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
  sourceField,
  specGroupField,
  warrantyFields,
} from "./shared";
import type { FieldDef, ProductSchema } from "./types";

const ITEM = "القطعة المستعملة";
const CONDITION = "الحالة والفحص";

export const USED_TYPE_VALUES = [
  "cartridge",
  "console",
  "controller",
  "accessory",
  "amiibo",
  "bundle",
] as const;

export const CONDITION_GRADE_VALUES = [
  "like_new",
  "excellent",
  "very_good",
  "good",
  "acceptable",
  "for_parts",
] as const;

export const PACKAGING_VALUES = ["cib", "boxed_no_manual", "loose", "sealed"] as const;

export const GUARANTEE_VALUES = [
  "tested_30days",
  "tested_14days",
  "tested_7days",
  "tested_only",
  "as_is",
] as const;

const item: FieldDef[] = [
  {
    key: "used_type",
    type: "enum",
    target: "usedType",
    required: true,
    enumValues: USED_TYPE_VALUES,
    description: `نوع القطعة: ${USED_TYPE_VALUES.join(" / ")}`,
    group: ITEM,
  },
  f.str("original_title", "originalTitle", "الاسم الأصلي للقطعة/اللعبة — لا يُترجم", {
    group: ITEM,
  }),
  f.str("platform", "platform", "المنصة (Nintendo Switch، Switch 2…)", {
    specKey: "platform",
    group: ITEM,
  }),
  f.str("serial_number", "serialNumber", "الرقم التسلسلي إن وُجد", { group: ITEM }),
  f.num("usage_period_months", "usagePeriodMonths", "مدة الاستخدام السابقة", {
    unit: "months",
    specKey: "usagePeriodMonths",
    group: ITEM,
  }),
  f.num("previous_owners", "previousOwners", "عدد الملاك السابقين", {
    specKey: "previousOwners",
    group: ITEM,
  }),
];

const condition: FieldDef[] = [
  {
    key: "condition_grade",
    type: "enum",
    target: "conditionGrade",
    required: true,
    enumValues: CONDITION_GRADE_VALUES,
    description: `درجة الحالة: ${CONDITION_GRADE_VALUES.join(" / ")}`,
    group: CONDITION,
  },
  {
    key: "packaging",
    type: "enum",
    target: "packaging",
    enumValues: PACKAGING_VALUES,
    description: `حالة التغليف: ${PACKAGING_VALUES.join(" / ")}`,
    group: CONDITION,
  },
  {
    key: "guarantee_status",
    type: "enum",
    target: "guaranteeStatus",
    enumValues: GUARANTEE_VALUES,
    description: `الضمان بعد الفحص: ${GUARANTEE_VALUES.join(" / ")}`,
    group: CONDITION,
  },
  f.text("condition_notes", "conditionNotes", "ملاحظات الحالة بصدق (خدوش، علامات استخدام…)", {
    group: CONDITION,
  }),
  f.bool("tested", "tested", "تم فحص القطعة (true/false)", {
    specKey: "tested",
    group: CONDITION,
  }),
  f.date("tested_at", "testedAt", "تاريخ الفحص YYYY-MM-DD", { group: CONDITION }),
  f.bool("cleaned", "cleaned", "تم التنظيف والتعقيم (true/false)", {
    specKey: "cleaned",
    group: CONDITION,
  }),
  {
    key: "defect",
    type: "string",
    target: "defects",
    repeatable: true,
    templateCount: 4,
    description: "العيوب المعروفة — اذكرها كاملة",
    group: CONDITION,
  },
  {
    key: "inspection_point",
    type: "string",
    target: "inspectionPoints",
    repeatable: true,
    templateCount: 5,
    description: "نقاط الفحص التي تمت (تشغيل، أزرار، شاشة، بطارية…)",
    group: CONDITION,
  },
];

export const USED_SCHEMA: ProductSchema = {
  id: "used",
  version: 1,
  label: "المستعمل",
  labelKey: "category.used",
  categoryId: "cat_used",
  kind: "used",
  templateFile: "used-product-template.txt",
  fields: [
    ...identityFields("اسم القطعة المستعملة"),
    ...descriptionFields(),
    ...item,
    ...condition,
    ...physicalFields(),
    specGroupField(),
    boxContentField(),
    ...warrantyFields(),
    ...mediaFields(),
    ...optionFields(),
    ...socialProofFields(),
    relatedField(),
    sourceField(),
    ...seoFields(),
  ],
};
