/**
 * Renders a blank import template from a schema.
 *
 * Field keys stay English on purpose: the parser matches on them, so if the
 * template's keys changed with the UI language every previously exported file
 * would stop importing. Only the comments are Arabic, matching the existing
 * Nintendo Switch Games template.
 */

import { fieldLevel } from "./quality";
import type { FieldDef, ProductSchema } from "./types";

const RULE = "# =========================================";

export function generateTemplate(schema: ProductSchema): string {
  const out: string[] = [];

  out.push(`# ${schema.label} — قالب استيراد المنتجات`);
  out.push(RULE);
  out.push("# الصيغة: field=value");
  out.push("# النصوص الطويلة: field<<EOF ... EOF");
  out.push("# العناصر المتكررة: feature.1= / feature.2= (بدون حد أقصى — .97 صالح مثل .1)");
  out.push("# العناصر المركبة: gallery.1.image= / gallery.1.title=");
  out.push("# المجموعات المتداخلة: spec_group.1.spec.2.value=");
  out.push("# القيم المنطقية: true أو false");
  out.push("# التواريخ: YYYY-MM-DD");
  out.push(RULE);
  out.push("# الأرقام المكتوبة في هذا القالب (.1 .2 .3) أمثلة فقط وليست حداً أقصى.");
  out.push("# أضف ما تحتاجه: feature.12= أو game_compatibility.40.game= تُقرأ جميعها.");
  out.push(RULE);
  out.push("# وسوم الحقول (تُقرأ آلياً ولا تُغيّرها):");
  out.push("#   @required     لا يكتمل المنتج بدونه");
  out.push("#   @recommended  يُستورد بدونه مع تنبيه في تقرير الجودة");
  out.push("#   @optional     لا تنبيه عند تركه فارغاً");
  out.push("#   @repeatable   يقبل عدداً غير محدود من العناصر");
  out.push("#   @conditional  يظهر فقط لنوع معيّن من المنتجات");
  out.push("#   @customer     قد يظهر للعميل في صفحة المنتج");
  out.push("#   @internal     داخلي — لا يُعرض للعميل إطلاقاً");
  out.push(RULE);
  out.push("# سياسة الحقول الفارغة:");
  out.push("# ابحث أولاً. لا تترك حقلاً قابلاً للبحث فارغاً بلا محاولة.");
  out.push("# إن لم تكن المعلومة منشورة: اكتب في الحقول النصية جملة دقيقة");
  out.push('# (مثال: "لم تنشر الشركة المصنّعة معلومات ضمان") — ولا تخترع قيمة أبداً.');
  out.push("# وللحقول الرقمية/المقيّدة اتركها فارغة وسجّل السبب في data_gap.N.");
  out.push("# الاستيراد لا يفشل بسبب حقل فارغ، لكن تقرير الجودة سيُظهر النقص.");
  out.push(RULE);
  out.push("");
  out.push(`# إصدار المخطط الحالي: ${schema.version}`);
  out.push(`schema_version=${schema.version}`);
  out.push("");

  let currentGroup: string | undefined;

  for (const field of schema.fields) {
    if (field.key === "schema_version") continue;

    if (field.group && field.group !== currentGroup) {
      currentGroup = field.group;
      out.push(RULE);
      out.push(`# ${currentGroup}`);
      out.push(RULE);
      out.push("");
    }

    out.push(...renderField(field, field.key, 0));
    out.push("");
  }

  return out.join("\n");
}

function renderField(field: FieldDef, path: string, depth: number): string[] {
  const lines: string[] = [];
  lines.push(...buildComment(field));

  const count = field.templateCount ?? (field.repeatable ? 3 : 1);

  if (field.repeatable) {
    for (let i = 1; i <= count; i++) {
      const indexed = `${path}.${i}`;
      if (field.type === "group" && field.itemFields) {
        for (const sub of Object.values(field.itemFields)) {
          lines.push(...renderField(sub, `${indexed}.${sub.key}`, depth + 1));
        }
        if (i < count) lines.push("");
      } else {
        lines.push(`${indexed}=`);
      }
    }
    return lines;
  }

  if (field.type === "group" && field.itemFields) {
    for (const sub of Object.values(field.itemFields)) {
      lines.push(...renderField(sub, `${path}.${sub.key}`, depth + 1));
    }
    return lines;
  }

  if (field.type === "multiline") {
    lines.push(`${path}<<EOF`);
    lines.push("");
    lines.push("EOF");
    return lines;
  }

  lines.push(`${path}=`);
  return lines;
}

/**
 * The machine-readable half of a field's comment.
 *
 * An LLM filling this template — which is how these files are actually
 * produced — reads prose unreliably and a fixed vocabulary reliably. So every
 * field carries the same tags in the same order, and the human sentence follows
 * on its own line.
 */
function buildTags(field: FieldDef): string {
  const tags: string[] = [`@${fieldLevel(field)}`];
  if (field.audience === "internal") tags.push("@internal");
  else tags.push("@customer");
  if (field.repeatable) tags.push("@repeatable");
  if (field.showFor) tags.push(`@conditional(${field.showFor.join("|")})`);
  if (field.type === "enum" && field.enumValues) {
    tags.push(`@enum(${field.enumValues.join("|")})`);
  } else {
    tags.push(`@type(${field.type})`);
  }
  if (field.unit) tags.push(`@unit(${field.unit})`);
  return tags.join(" ");
}

function buildComment(field: FieldDef): string[] {
  const lines = [`# ${buildTags(field)}`];
  const parts: string[] = [];
  if (field.description) parts.push(field.description);
  if (field.required) parts.push("[مطلوب لإتمام الاستيراد]");
  if (field.showFor) parts.push(`[يظهر عند accessory_type = ${field.showFor.join(" أو ")}]`);
  if (parts.length) lines.push(`# ${parts.join(" ")}`);
  return lines;
}

/** Flat count of every distinct piece of information a schema can capture. */
export function countSchemaFields(schema: ProductSchema): number {
  const walk = (defs: FieldDef[]): number =>
    defs.reduce((sum, def) => {
      if (def.type === "group" && def.itemFields) {
        return sum + walk(Object.values(def.itemFields));
      }
      return sum + 1;
    }, 0);
  return walk(schema.fields);
}
