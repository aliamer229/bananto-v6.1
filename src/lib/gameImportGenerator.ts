import { GAME_IMPORT_SCHEMA, FieldDef } from "./gameImportSchema";

export function generateGameImportTemplate(): string {
  let template = "# Nintendo Switch Game Import Template\n";
  template += "# =========================================\n";
  template += "# الصيغة: field=value\n";
  template += "# النصوص الطويلة: field<<EOF ... EOF\n";
  template += "# العناصر المتكررة: genre.1=Action, genre.2=RPG\n";
  template += "# =========================================\n\n";

  for (const field of GAME_IMPORT_SCHEMA) {
    if (field.description) {
      template += `# ${field.description}\n`;
    }

    if (field.type === "object" && field.repeatable && field.itemFields) {
      // Generate 3 example entries for repeatable objects
      for (let i = 1; i <= 3; i++) {
        template += `# ${field.description} (${i})\n`;
        for (const subKey in field.itemFields) {
          const subDef = field.itemFields[subKey];
          if (subDef) {
            template += `${field.key}.${i}.${subKey}=\n`;
          }
        }
      }
    } else if (field.key === "slug") {
      template += `# الرابط الفريد (اختياري)\n${field.key}=\n`;
    } else if (field.repeatable) {
      // Generate 3 example entries for repeatable simple fields
      for (let i = 1; i <= 3; i++) {
        template += `${field.key}.${i}=\n`;
      }
    } else if (field.type === "multiline") {
      template += `${field.key}<<EOF\n\nEOF\n`;
    } else {
      template += `${field.key}=\n`;
    }
    template += "\n";
  }

  return template;
}
