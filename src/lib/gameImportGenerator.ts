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
    }
    if (field.description) {
      template += `# ${field.description}\n`;
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

/** Renders nested fields recursively, including device_performance.N.mode.N.*. */
function renderField(field: FieldDef, path: string): string {
  if (field.repeatable) {
    let output = "";
    const repeats = field.templateRepeat ?? 3;
    for (let index = 1; index <= repeats; index++) {
      const indexedPath = `${path}.${index}`;
      if (field.type === "object" && field.itemFields) {
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
