import { GAME_IMPORT_SCHEMA, FieldDef } from "./gameImportSchema";

/** Printed immediately above a run of boolean fields, and nowhere else. */
export const BOOLEAN_ONLY_NOTE = "BOOLEAN ONLY: true / false / blank if unknown";

/**
 * One line of the template.
 *
 * The boolean note has to sit directly above the fields it describes, so the
 * template is built as lines that know what they are rather than as one string:
 * a note printed above a whole group lands above `device_performance.1.device`,
 * which is text, and teaches exactly the mistake it was meant to prevent.
 */
type TemplateLine =
  | { kind: "comment" | "blank"; text: string }
  | { kind: "value"; text: string; isBoolean: boolean; group: string };

/**
 * Which family of fields a line belongs to, so a run of booleans never spans
 * two unrelated sections: `supports_arabic` and `multiplayer_local` are both
 * flags, but they are not one group, and the multiplayer block has to carry its
 * own note. Nested paths inherit their top-level field's family, which keeps
 * `handheld.hdr` and `handheld.vrr` together under one note.
 */
const familyOf = (topLevelKey: string) => topLevelKey.split("_")[0] || topLevelKey;

const BOOLEAN_RULE = [
  "# BOOLEAN RULE:",
  "# Boolean fields accept only:",
  "#   true",
  "#   false",
  "#   blank if unknown",
  "#",
  "# Never write: Not Published / Unknown / N/A / Yes / No / Not Supported",
  "# An explanation belongs in performance_notes, or in the matching",
  "# device_performance.X.handheld.notes / .tv.notes / .performance_notes.",
  "#",
  "# resolution_dynamic is BOOLEAN ONLY:",
  "#   true  = resolution is dynamic",
  "#   false = resolution is fixed",
  "#   blank = unknown",
  "# The measured values belong in resolution / rendering_resolution /",
  "# output_resolution — never in resolution_dynamic.",
  "#",
  "# Player counts live in players_count / players / player_count, never in a",
  "# multiplayer_* flag.",
];

export function generateGameImportTemplate(): string {
  const lines: TemplateLine[] = [];
  const comment = (text: string) => lines.push({ kind: "comment", text });

  comment("# Nintendo Switch Game Import Template");
  comment("# =========================================");
  comment("# الصيغة: field=value");
  comment("# النصوص الطويلة: field<<EOF ... EOF");
  comment("# العناصر المتكررة: genre.1=Action, genre.2=RPG");
  comment("# =========================================");
  lines.push({ kind: "blank", text: "" });
  BOOLEAN_RULE.forEach(comment);
  comment("# =========================================");
  lines.push({ kind: "blank", text: "" });

  for (const field of GAME_IMPORT_SCHEMA) {
    if (field.key === "device_performance") {
      comment("# =========================================");
      comment("# DEVICE PERFORMANCE");
      comment("# =========================================");
      comment("# Actual game performance only; never copy hardware maximum capabilities.");
      comment("# Leave unpublished values blank or use information_status with a source/reason.");
      /*
        One index per *distinct* device. Repeating the same device across .1,
        .2 and .3 is what produced phantom duplicates in the catalogue, and the
        importer now refuses a file that does it.
      */
      comment("# ONE DEVICE PER INDEX: .1 is the first real device, .2 only if a");
      comment("# genuinely different second device has its own measured data, .3 likewise.");
      comment("# Never repeat the same device across indexes — leave unused ones blank.");
    }
    if (field.description) {
      comment(`# ${field.description}`);
    }

    if (field.key === "slug") {
      comment("# الرابط الفريد (اختياري)");
      lines.push({ kind: "value", text: `${field.key}=`, isBoolean: false, group: "slug" });
    } else {
      lines.push(...renderField(field, field.key, familyOf(field.key)));
    }
    lines.push({ kind: "blank", text: "" });
  }

  return annotateBooleans(lines)
    .map((line) => `${line.text}\n`)
    .join("");
}

/**
 * Inserts the boolean note above each run of boolean fields.
 *
 * A run is consecutive *value* lines that are boolean; the comments and blank
 * lines between them (a field's own description, for instance) do not break it,
 * so six multiplayer flags get one note rather than six. The note is placed
 * above the description of the first field in the run, not between the
 * description and its field.
 */
function annotateBooleans(lines: TemplateLine[]): TemplateLine[] {
  const out: TemplateLine[] = [];
  let previousValueWasBoolean = false;
  let previousGroup = "";

  for (const line of lines) {
    const startsRun =
      line.kind === "value" &&
      line.isBoolean &&
      (!previousValueWasBoolean || line.group !== previousGroup);
    if (startsRun) {
      // Step back over the comment/blank lines this field already printed so
      // the note heads the whole block.
      let insertAt = out.length;
      while (insertAt > 0 && out[insertAt - 1]!.kind === "comment") insertAt--;
      out.splice(insertAt, 0, { kind: "comment", text: `# ${BOOLEAN_ONLY_NOTE}` });
    }
    if (line.kind === "value") {
      previousValueWasBoolean = line.isBoolean;
      previousGroup = line.group;
    }
    out.push(line);
  }

  return out;
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
function renderField(field: FieldDef, path: string, group: string): TemplateLine[] {
  if (field.repeatable) {
    const out: TemplateLine[] = [];
    const repeats = field.templateRepeat ?? 3;
    const simpleList = isSimpleList(field);
    for (let index = 1; index <= repeats; index++) {
      const indexedPath = `${path}.${index}`;
      if (simpleList) {
        out.push({ kind: "value", text: `${indexedPath}=`, isBoolean: false, group });
      } else if (field.type === "object" && field.itemFields) {
        for (const child of Object.values(field.itemFields)) {
          out.push(...renderField(child, `${indexedPath}.${child.key}`, group));
        }
      } else {
        out.push({
          kind: "value",
          text: `${indexedPath}=${defaultOf(field)}`,
          isBoolean: field.type === "boolean",
          group,
        });
      }
    }
    return out;
  }

  if (field.type === "object" && field.itemFields) {
    return Object.values(field.itemFields).flatMap((child) =>
      renderField(child, `${path}.${child.key}`, group),
    );
  }
  if (field.type === "multiline") {
    return [
      { kind: "value", text: `${path}<<EOF`, isBoolean: false, group },
      { kind: "value", text: "", isBoolean: false, group },
      { kind: "value", text: "EOF", isBoolean: false, group },
    ];
  }
  return [
    {
      kind: "value",
      text: `${path}=${defaultOf(field)}`,
      isBoolean: field.type === "boolean",
      group,
    },
  ];
}

/** Pre-filled value for fields that declare one; every other field stays blank. */
function defaultOf(field: FieldDef): string {
  return field.defaultValue === undefined || field.defaultValue === null
    ? ""
    : String(field.defaultValue);
}
