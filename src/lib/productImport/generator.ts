/**
 * Renders a blank import template from a schema.
 *
 * Field keys stay English on purpose: the parser matches on them, so if the
 * template's keys changed with the UI language every previously exported file
 * would stop importing. Only the comments are Arabic, matching the existing
 * Nintendo Switch Games template.
 */

import type { FieldDef, ProductSchema } from "./types";

const RULE = "# =========================================";

export function generateTemplate(schema: ProductSchema): string {
  const out: string[] = [];

  out.push(`# ${schema.label} — قالب استيراد المنتجات`);
  out.push(RULE);
  out.push("# الصيغة: field=value");
  out.push("# النصوص الطويلة: field<<EOF ... EOF");
  out.push("# العناصر المتكررة: feature.1= / feature.2= (بدون حد أقصى)");
  out.push("# العناصر المركبة: gallery.1.image= / gallery.1.title=");
  out.push("# المجموعات المتداخلة: spec_group.1.spec.2.value=");
  out.push("# القيم المنطقية: true أو false");
  out.push("# التواريخ: YYYY-MM-DD");
  out.push("# اترك أي حقل فارغاً إذا لم تكن لديك المعلومة — لن يفشل الاستيراد.");
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
  const comment = buildComment(field);
  if (comment) lines.push(comment);

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

function buildComment(field: FieldDef): string | undefined {
  const parts: string[] = [];
  if (field.description) parts.push(field.description);
  if (field.required) parts.push("[مطلوب]");
  if (field.unit) parts.push(`[الوحدة: ${field.unit}]`);
  if (field.showFor) parts.push(`[يظهر عند accessory_type = ${field.showFor.join(" أو ")}]`);
  if (!parts.length) return undefined;
  return `# ${parts.join(" ")}`;
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
