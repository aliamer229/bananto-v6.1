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
  comment("#");
  comment("# ⚠ الترقيم مفتوح وغير محدود — الأرقام المطبوعة أدناه أمثلة وليست حداً أقصى.");
  comment("#   أكمل حتى genre.N / faq.N / gallery.N / source.N بقدر ما توجد معلومات حقيقية.");
  comment("# NUMBERING IS OPEN-ENDED: the printed indexes are examples, not a maximum.");
  comment("#   Continue to .N for as many entries as genuinely exist — 1, 10, 30, more.");
  comment("#   Never stop at the last printed slot; never invent entries to fill one.");
  comment("# =========================================");
  comment("# RESEARCH DEPTH — عمق البحث");
  comment("# =========================================");
  comment("# كل حقل يظهر في صفحة تفاصيل اللعبة يجب البحث عنه وتعبئته إن وُجدت معلومة حقيقية.");
  comment("# لا تترك حقلاً فارغاً لمجرد أنه يحتاج بحثاً أعمق. ولا تختلق معلومات.");
  comment("# Every field shown on the game details page must be researched and filled");
  comment("# whenever factual information exists. Do not leave one blank merely");
  comment("# because it needs deeper research — and never invent facts.");
  comment("#");
  comment("# إذا كانت المعلومة غير موجودة فعلاً أو غير منطبقة، اكتب جملة واضحة للقارئ:");
  comment("#   \"لم يُعلن عن أي محتوى إضافي مستقل.\"");
  comment("#   \"لا يدعم اللعب اللاسلكي المحلي.\"");
  comment("# When something genuinely does not exist or does not apply, write a short");
  comment("# human sentence in USER-FACING TEXT fields:");
  comment("#   \"No standalone DLC has been announced.\"");
  comment("#   \"No official soundtrack release has been announced.\"");
  comment("#   \"Local wireless multiplayer is not supported.\"");
  comment("# Do NOT write N/A, Unknown, -, or \"Not available\" where a clear sentence");
  comment("# belongs. A section with no content is hidden on the page, so an empty");
  comment("# field is silence — not an explanation.");
  comment("# =========================================");
  lines.push({ kind: "blank", text: "" });
  BOOLEAN_RULE.forEach(comment);
  comment("# =========================================");
  lines.push({ kind: "blank", text: "" });

  for (const field of GAME_IMPORT_SCHEMA) {
    if (field.key === "front_cover_image") {
      /*
        Five image fields, five different jobs. They were being filled with the
        same URL because nothing in the template said what each one was *for* —
        and the storefront then showed a tall retail box in a square card slot,
        a box photo stretched across a landscape hero, and a fabricated wrap on
        the 3D case. The roles are enforced in code (src/lib/nintendoImages.ts);
        this is where a human or an extraction system learns them.
      */
      comment("# =========================================");
      comment("# IMAGE ROLES — أدوار الصور");
      comment("# =========================================");
      comment("# لكل حقل صورة دور مختلف. لا تضع نفس الرابط في أكثر من دور.");
      comment("# Each image field has a DIFFERENT job. Do not put the same URL in two roles.");
      comment("#");
      comment("# ── front_cover_image — Front Box Cover ─────────────────────");
      comment("#   صورة عمودية نظيفة عالية الدقة لعلبة اللعبة من الأمام مباشرة.");
      comment("#   بدون هوامش/خلفية بيضاء حول العلبة. العلبة نفسها يجب أن تبقى كاملة.");
      comment("#   A clean, high-resolution, VERTICAL photo of the retail box seen");
      comment("#   straight from the front. Crop away the outer white canvas, never");
      comment("#   the box itself — keep its edges, plastic border, ratings and logos.");
      comment("#   Used by: Latest Nintendo Releases, /nintendo_games, and as the");
      comment("#   static image shown in place of the 3D model when none is possible.");
      comment("#");
      comment("# ── nintendo_card_image — Square Card Image ─────────────────");
      comment("#   فن مربّع (أو شبه مربّع) مُعدّ لنافذة الصورة داخل بطاقة الخرطوشة.");
      comment("#   ليست صورة علبة. يجب أن تكون مقروءة بحجم صغير ومتمركزة بصرياً.");
      comment("#   SQUARE / near-square key art prepared for the artwork window inside");
      comment("#   the cartridge-style card. This is NOT a retail box cover. It must");
      comment("#   read well at small size. The card supplies its own frame.");
      comment("#   Used by: the homepage \"ألعاب نينتندو سويتش\" strip.");
      comment("#");
      comment("# ── cover_texture_url — 3D Texture Source (OPTIONAL) ───────");
      comment("#   الغلاف الكامل بدقة عالية: Back Cover + Spine + Front Cover في صورة واحدة.");
      comment("#   إن لم يتوفر غلاف كامل حقيقي: اترك الحقل فارغاً.");
      comment("#   The complete printed wrap in ONE image, laid out left to right as");
      comment("#   back | spine | front, matching the model's UVs.");
      comment("#   If no genuine full wrap exists, LEAVE THIS EMPTY. The product page");
      comment("#   then shows the Front Box Cover as a static image instead of the 3D");
      comment("#   case. Do NOT invent a wrap, and do NOT put a front-only cover, a");
      comment("#   square card, a banner or a screenshot here.");
      comment("#");
      comment("# ── cover_image — Cover Image ───────────────────────────────");
      comment("#   الفن الرئيسي العريض المستخدم كخلفية لقسم البطل في صفحة التفاصيل.");
      comment("#   ليست صورة العلبة الأمامية.");
      comment("#   Wide hero / key art used as the blurred, darkened background behind");
      comment("#   the title and price on the product details page. NOT the retail box:");
      comment("#   a tall box photo stretched across a landscape header looks broken.");
      comment("#");
      comment("# ── banner_image.N — Banner Images ─────────────────────────");
      comment("#   فن ترويجي عريض عالي الدقة. كل بانر يجب أن يكون مختلفاً.");
      comment("#   Wide promotional key art. Each banner should be a DISTINCT image.");
      comment("#");
      comment("# ── gallery.N.image — Gallery Images ───────────────────────");
      comment("#   لقطات رسمية من اللعب. لا تكرّر نفس الصورة لملء الخانات.");
      comment("#   Official screenshots and gameplay scenes. Do not repeat one image");
      comment("#   to fill slots — leave the extra ones blank instead.");
      comment("# =========================================");
    }
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
    /*
      Example slots, never a ceiling — the parser reads whatever indices the
      file contains (verified at 1, 3, 10 and 30 in gameImportRepeats.test.ts).

      The default used to be 3, and that number was the whole problem: an
      extraction system reading this template has nothing to go on but its
      shape, so three printed slots taught it that three genres, three FAQs and
      three sources were all that existed. Six is enough that the pattern reads
      as "continue as needed" rather than as a limit; a field that genuinely
      wants more sets `templateRepeat` explicitly, and a field that is bounded
      by the product model (`option`) sets it lower on purpose.
    */
    const repeats = field.templateRepeat ?? 6;
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
