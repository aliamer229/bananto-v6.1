import { GAME_IMPORT_SCHEMA, FieldDef } from "./gameImportSchema";

export function generateGameImportTemplate(): string {
  let template = "# Nintendo Switch Game Import Template\n";
  template += "# =========================================\n";
  template += "# الصيغة: field=value\n";
  template += "# النصوص الطويلة: field<<EOF ... EOF\n";
  template += "# العناصر المتكررة: genre.1=Action, genre.2=RPG\n";
  template += "# =========================================\n\n";

  for (const field of GAME_IMPORT_SCHEMA) {
    if (field.key === "device_performance") {
      template += "# =========================================\n";
      template += "# DEVICE PERFORMANCE\n";
      template += "# =========================================\n";
      template += "# Actual game performance only; never copy hardware maximum capabilities.\n";
      template +=
        "# Leave unpublished values blank or use information_status with a source/reason.\n";
      /*
        One index per *distinct* device. Repeating the same device across .1,
        .2 and .3 is what produced phantom duplicates in the catalogue, and the
        importer now refuses a file that does it.
      */
      template += "# ONE DEVICE PER INDEX: .1 is the first real device, .2 only if a\n";
      template += "# genuinely different second device has its own measured data, .3 likewise.\n";
      template += "# Never repeat the same device across indexes — leave unused ones blank.\n";
    }
    if (field.description) {
      template += `# ${field.description}\n`;
    }
    if (hasBooleanMember(field)) {
      template += `# ${BOOLEAN_ONLY_NOTE}\n`;
    }

    if (field.key === "slug") {
      template += `# الرابط الفريد (اختياري)\n${field.key}=\n`;
    } else {
      template += renderField(field, field.key);
    }
    template += "\n";
  }

  return template;
}

/** Printed above any group that carries a boolean, so nobody writes prose in one. */
export const BOOLEAN_ONLY_NOTE = "BOOLEAN ONLY: true / false / blank if unknown";

/** Does this field, or anything nested inside it, take true/false? */
function hasBooleanMember(field: FieldDef): boolean {
  if (field.type === "boolean") return true;
  return Object.values(field.itemFields || {}).some(hasBooleanMember);
}

/**
 * A repeatable group that carries nothing but `value` is a list of plain
 * strings, not a list of objects.
 *
 * The parser accepts both `feature.1=text` and the older `feature.1.value=text`
 * and flattens either to `string[]`, but the template only ever teaches the
 * direct form: writing `.value` invited files that nested the text one level
 * deeper than the editor expects, which is what rendered as `[object Object]`.
 */
function isSimpleList(field: FieldDef): boolean {
  const members = Object.keys(field.itemFields || {});
  return (
    field.repeatable === true &&
    field.type === "object" &&
    members.length === 1 &&
    members[0] === "value"
  );
}

/** Renders nested fields recursively, including device_performance.N.mode.N.*. */
function renderField(field: FieldDef, path: string): string {
  if (field.repeatable) {
    let output = "";
    const repeats = field.templateRepeat ?? 3;
    const simpleList = isSimpleList(field);
    for (let index = 1; index <= repeats; index++) {
      const indexedPath = `${path}.${index}`;
      if (simpleList) {
        output += `${indexedPath}=\n`;
      } else if (field.type === "object" && field.itemFields) {
        for (const child of Object.values(field.itemFields)) {
          output += renderField(child, `${indexedPath}.${child.key}`);
        }
      } else {
        output += `${indexedPath}=${defaultOf(field)}\n`;
      }
    }
    return output;
  }

  if (field.type === "object" && field.itemFields) {
    return Object.values(field.itemFields)
      .map((child) => renderField(child, `${path}.${child.key}`))
      .join("");
  }
  if (field.type === "multiline") return `${path}<<EOF\n\nEOF\n`;
  return `${path}=${defaultOf(field)}\n`;
}

/** Pre-filled value for fields that declare one; every other field stays blank. */
function defaultOf(field: FieldDef): string {
  return field.defaultValue === undefined || field.defaultValue === null
    ? ""
    : String(field.defaultValue);
}
