/**
 * Parser for Store Services import templates:
 * - Troubleshooting (حلول المشاكل)
 * - Registration Guides (تعليمات التسجيل والأدلة)
 * - FAQ (الأسئلة الشائعة)
 * - Purchase Policy (سياسة الشراء وحقوقك)
 */

import type {
  FaqParsedCategory,
  FaqParsedItem,
  FaqParseResultData,
  GuideStepItem,
  ParsedIssue,
  PolicyParsedSection,
  PolicyParseResultData,
  RegistrationGuideItem,
  ServiceParseResult,
  ServiceSectionType,
  TroubleshootingItem,
} from "./types";

/** Normalizes a key: lowercase, arabic-indic digits -> latin, spaces -> underscore */
function normalizeKey(key: string): string {
  return key
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/^[-*•]\s*/, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

/** Parses loose boolean values in Arabic/English */
export function parseBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  if (["true", "1", "yes", "y", "on", "نعم", "صح", "مفعل", "مفعّل", "نشط"].includes(v)) return true;
  if (["false", "0", "no", "n", "off", "لا", "خطأ", "معطل", "معطّل"].includes(v)) return false;
  return fallback;
}

/**
 * Extracts raw key-value pairs and heredocs from template text.
 * Supports:
 *  - key=value  and  key: value
 *  - key<<EOF ... EOF   (any terminator token: <<END, <<TEXT ...)
 *  - comments (#, //), BOM, arabic-indic digits in indexes
 *  - repeated keys are kept as key, key.2, key.3 (never overwritten silently)
 */
export function extractKeyValues(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let currentKey: string | null = null;
  let terminator = "EOF";
  let heredocBuffer: string[] = [];
  let inHeredoc = false;

  const put = (rawKey: string, value: string) => {
    const key = normalizeKey(rawKey);
    if (!key) return;
    if (map[key] === undefined) {
      map[key] = value;
      return;
    }
    // Repeated key -> keep both (key.2, key.3 ...)
    let n = 2;
    while (map[`${key}.${n}`] !== undefined) n++;
    map[`${key}.${n}`] = value;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();

    // Check Heredoc termination
    if (inHeredoc) {
      if (trimmed === terminator) {
        if (currentKey) put(currentKey, heredocBuffer.join("\n").trim());
        inHeredoc = false;
        currentKey = null;
        heredocBuffer = [];
      } else {
        heredocBuffer.push(rawLine);
      }
      continue;
    }

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Heredoc start: key<<EOF / key<<END / key<<<
    const heredocMatch = trimmed.match(/^(.+?)\s*<<<?\s*([A-Za-z0-9_]*)\s*$/);
    if (heredocMatch) {
      currentKey = (heredocMatch[1] ?? "").trim();
      terminator = heredocMatch[2] || "EOF";
      inHeredoc = true;
      heredocBuffer = [];
      continue;
    }

    // Standard key=value (fallback to "key: value")
    const eqIdx = rawLine.indexOf("=");
    const colonIdx = rawLine.indexOf(":");
    const sepIdx =
      eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)
        ? eqIdx
        : colonIdx !== -1 && colonIdx < 60
          ? colonIdx
          : -1;
    if (sepIdx !== -1) {
      const k = rawLine.slice(0, sepIdx).trim();
      const v = rawLine.slice(sepIdx + 1).trim();
      if (k && !/\s{2,}/.test(k)) put(k, v);
    }
  }

  // If heredoc didn't close properly, close with whatever we had
  if (inHeredoc && currentKey) {
    put(currentKey, heredocBuffer.join("\n").trim());
  }

  return map;
}

/** Splits a value into a clean list (newlines, commas, arabic comma, bullets, pipes) */
export function toList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|،|,|\||;/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)-])\s*/, "").trim())
    .filter(Boolean);
}


/**
 * Parse JSON fallback if admin pasted a JSON payload
 */
function tryParseJson(text: string): any | null {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 1. Parser for Troubleshooting & Problem Solutions
 */
export function parseTroubleshooting(text: string): ServiceParseResult<TroubleshootingItem[]> {
  const issues: ParsedIssue[] = [];
  const json = tryParseJson(text);

  if (json) {
    const items: any[] = Array.isArray(json)
      ? json
      : Array.isArray(json.problemSolutions)
        ? json.problemSolutions
        : Array.isArray(json.kbArticles)
          ? json.kbArticles
          : [json];

    const normalized: TroubleshootingItem[] = items.map((item, idx) => ({
      id: item.id || `kb_imported_${idx + 1}_${Date.now()}`,
      title: item.title || item.title_ar || `مشكلة رقم ${idx + 1}`,
      category: item.category || item.category_ar || "عام",
      description: item.description || item.description_ar || "",
      errorCodes: item.errorCodes || item.error_codes || "",
      keywords: item.keywords || item.match || "",
      ask: item.ask || "",
      imageUrl: item.imageUrl || item.image_url || "",
      steps: Array.isArray(item.steps)
        ? item.steps
        : typeof item.steps === "string"
          ? item.steps.split(/\r?\n/).filter((s: string) => s.trim())
          : [],
    }));

    return {
      schemaType: "troubleshooting",
      success: true,
      rawText: text,
      data: normalized,
      issues,
      stats: {
        totalItems: normalized.length,
        totalFieldsDetected: Object.keys(json).length,
        totalSectionsOrSteps: normalized.reduce((acc, it) => acc + it.steps.length, 0),
        hasErrors: false,
      },
    };
  }

  const kv = extractKeyValues(text);
  const items: TroubleshootingItem[] = [];

  // Check if multiple problems are formatted as problem.1.title, problem.2.title...
  const problemIndices = new Set<string>();
  for (const k of Object.keys(kv)) {
    const match = k.match(/^problem\.(\d+)\./);
    if (match && match[1]) {
      problemIndices.add(match[1]);
    }
  }

  if (problemIndices.size > 0) {
    const sortedIndices = Array.from(problemIndices).sort((a, b) => Number(a) - Number(b));
    for (const idx of sortedIndices) {
      const pTitle = kv[`problem.${idx}.title`] || kv[`problem.${idx}.title_ar`];
      if (!pTitle) {
        issues.push({
          severity: "warning",
          field: `problem.${idx}.title`,
          messageAr: `المشكلة رقم ${idx} تفتقر إلى عنوان، تم تخطيها`,
          messageEn: `Problem #${idx} is missing a title and was skipped`,
        });
        continue;
      }

      // Collect steps for problem.N.step.X
      const steps: string[] = [];
      const stepIndices = new Set<number>();
      for (const k of Object.keys(kv)) {
        const stepMatch = k.match(new RegExp(`^problem\\.${idx}\\.step\\.(\\d+)$`));
        if (stepMatch) {
          stepIndices.add(Number(stepMatch[1]));
        }
      }
      for (const sIdx of Array.from(stepIndices).sort((a, b) => a - b)) {
        const stepText = kv[`problem.${idx}.step.${sIdx}`];
        if (stepText) steps.push(stepText);
      }

      // If single multiline steps key used
      const stepsRaw = kv[`problem.${idx}.steps`];
      if (steps.length === 0 && stepsRaw) {
        steps.push(...stepsRaw.split(/\r?\n/).filter((s) => s.trim()));
      }

      items.push({
        id: kv[`problem.${idx}.id`] || `kb_imported_${idx}_${Date.now().toString(36)}`,
        title: pTitle,
        category: kv[`problem.${idx}.category`] || kv[`problem.${idx}.category_ar`] || "عام",
        description: kv[`problem.${idx}.description`] || kv[`problem.${idx}.description_ar`] || "",
        errorCodes: kv[`problem.${idx}.error_codes`] || kv[`problem.${idx}.errorcodes`] || "",
        keywords: kv[`problem.${idx}.keywords`] || kv[`problem.${idx}.match`] || "",
        ask: kv[`problem.${idx}.ask`] || "",
        imageUrl: kv[`problem.${idx}.image_url`] || kv[`problem.${idx}.imageurl`] || "",
        steps: steps.length > 0 ? steps : ["يرجى التواصل مع الدعم الفني لمتابعة الحل."],
      });
    }
  }

  // Also check top-level single problem definition if present
  if (kv["title"] || kv["title_ar"]) {
    const singleSteps: string[] = [];
    const stepIndices = new Set<number>();
    for (const k of Object.keys(kv)) {
      const stepMatch = k.match(/^step\.(\d+)$/);
      if (stepMatch) stepIndices.add(Number(stepMatch[1]));
    }
    for (const sIdx of Array.from(stepIndices).sort((a, b) => a - b)) {
      const stepText = kv[`step.${sIdx}`];
      if (stepText) singleSteps.push(stepText);
    }
    if (singleSteps.length === 0 && kv["steps"]) {
      singleSteps.push(...kv["steps"].split(/\r?\n/).filter((s) => s.trim()));
    }

    items.unshift({
      id: kv["id"] || `kb_imported_${Date.now().toString(36)}`,
      title: kv["title"] || kv["title_ar"] || "",
      category: kv["category"] || kv["category_ar"] || "عام",
      description: kv["description"] || kv["description_ar"] || "",
      errorCodes: kv["error_codes"] || kv["errorcodes"] || "",
      keywords: kv["keywords"] || kv["match"] || "",
      ask: kv["ask"] || "",
      imageUrl: kv["image_url"] || kv["imageurl"] || "",
      steps:
        singleSteps.length > 0 ? singleSteps : ["يرجى اتباع الإرشادات والتواصل مع الدعم الفني."],
    });
  }

  if (items.length === 0) {
    issues.push({
      severity: "error",
      field: "title",
      messageAr: "لم يتم العثور على عنوان مشكلة صالح في النص المدخل (title=...)",
      messageEn: "No valid problem title found in the provided template text",
    });
  }

  return {
    schemaType: "troubleshooting",
    success: issues.filter((i) => i.severity === "error").length === 0,
    rawText: text,
    data: items,
    issues,
    stats: {
      totalItems: items.length,
      totalFieldsDetected: Object.keys(kv).length,
      totalSectionsOrSteps: items.reduce((acc, it) => acc + it.steps.length, 0),
      hasErrors: issues.some((i) => i.severity === "error"),
    },
  };
}

/**
 * 2. Parser for Registration & Setup Guides
 */
export function parseRegistrationGuides(text: string): ServiceParseResult<RegistrationGuideItem[]> {
  const issues: ParsedIssue[] = [];
  const json = tryParseJson(text);

  if (json) {
    const rawList = Array.isArray(json) ? json : Array.isArray(json.guides) ? json.guides : [json];
    const normalized: RegistrationGuideItem[] = rawList.map((g: any, idx: number) => ({
      id: g.id || `guide_${idx + 1}_${Date.now()}`,
      title_ar: g.title_ar || g.title || `دليل تفعيل ${idx + 1}`,
      title_en: g.title_en || "",
      slug: g.slug || `guide-${idx + 1}`,
      category: g.category || "الحسابات والألعاب",
      description_ar: g.description_ar || g.description || "",
      description_en: g.description_en || "",
      cover_image: g.cover_image || g.image || "",
      video_url: g.video_url || g.video || "",
      estimated_time: g.estimated_time || "3 دقائق",
      difficulty: g.difficulty || "سهل",
      sort_order: g.sort_order ?? idx + 1,
      published: g.published ?? true,
      steps: Array.isArray(g.steps)
        ? g.steps.map((st: any, sIdx: number) => ({
            id: st.id || `step_${sIdx + 1}`,
            title_ar: st.title_ar || st.title || `الخطوة ${sIdx + 1}`,
            title_en: st.title_en || "",
            description_ar: st.description_ar || st.description || "",
            description_en: st.description_en || "",
            image: st.image || "",
            video: st.video || "",
            note_ar: st.note_ar || st.note || "",
            warning_ar: st.warning_ar || st.warning || "",
            sort_order: st.sort_order ?? sIdx + 1,
          }))
        : [],
    }));

    return {
      schemaType: "registration_guides",
      success: true,
      rawText: text,
      data: normalized,
      issues,
      stats: {
        totalItems: normalized.length,
        totalFieldsDetected: Object.keys(json).length,
        totalSectionsOrSteps: normalized.reduce((acc, g) => acc + g.steps.length, 0),
        hasErrors: false,
      },
    };
  }

  const kv = extractKeyValues(text);
  const guides: RegistrationGuideItem[] = [];

  // Parse steps for single guide
  const steps: GuideStepItem[] = [];
  const stepIndices = new Set<number>();
  for (const k of Object.keys(kv)) {
    const match = k.match(/^step\.(\d+)\./);
    if (match) stepIndices.add(Number(match[1]));
  }

  for (const sIdx of Array.from(stepIndices).sort((a, b) => a - b)) {
    const stepTitle = kv[`step.${sIdx}.title_ar`] || kv[`step.${sIdx}.title`] || `الخطوة ${sIdx}`;
    const stepDesc = kv[`step.${sIdx}.description_ar`] || kv[`step.${sIdx}.description`] || "";
    steps.push({
      id: `step_${sIdx}_${Date.now().toString(36)}`,
      title_ar: stepTitle,
      title_en: kv[`step.${sIdx}.title_en`] || "",
      description_ar: stepDesc,
      description_en: kv[`step.${sIdx}.description_en`] || "",
      image: kv[`step.${sIdx}.image`] || "",
      video: kv[`step.${sIdx}.video`] || "",
      note_ar: kv[`step.${sIdx}.note_ar`] || kv[`step.${sIdx}.note`] || "",
      warning_ar: kv[`step.${sIdx}.warning_ar`] || kv[`step.${sIdx}.warning`] || "",
      sort_order: sIdx,
    });
  }

  const titleAr = kv["title_ar"] || kv["title"];
  if (titleAr) {
    guides.push({
      id: kv["id"] || `guide_${Date.now().toString(36)}`,
      title_ar: titleAr,
      title_en: kv["title_en"] || "",
      slug:
        kv["slug"] ||
        titleAr
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ||
        `guide-${Date.now()}`,
      category: kv["category"] || "الحسابات والألعاب الرقمية",
      description_ar: kv["description_ar"] || kv["description"] || "",
      description_en: kv["description_en"] || "",
      cover_image: kv["cover_image"] || "",
      video_url: kv["video_url"] || "",
      estimated_time: kv["estimated_time"] || "3 دقائق",
      difficulty: kv["difficulty"] || "سهل جداً",
      sort_order: 1,
      published: true,
      steps,
    });
  } else {
    issues.push({
      severity: "error",
      field: "title_ar",
      messageAr: "يرجى تحديد عنوان الدليل في القالب (title_ar=...)",
      messageEn: "Guide title_ar is missing in the template",
    });
  }

  return {
    schemaType: "registration_guides",
    success: issues.filter((i) => i.severity === "error").length === 0,
    rawText: text,
    data: guides,
    issues,
    stats: {
      totalItems: guides.length,
      totalFieldsDetected: Object.keys(kv).length,
      totalSectionsOrSteps: steps.length,
      hasErrors: issues.some((i) => i.severity === "error"),
    },
  };
}

/**
 * 3. Parser for FAQ (Categories and Questions)
 */
export function parseFaq(text: string): ServiceParseResult<FaqParseResultData> {
  const issues: ParsedIssue[] = [];
  const json = tryParseJson(text);

  if (json) {
    const rawCategories: any[] = Array.isArray(json.faqCategories)
      ? json.faqCategories
      : Array.isArray(json.categories)
        ? json.categories
        : [];
    const rawFaqs: any[] = Array.isArray(json.faq)
      ? json.faq
      : Array.isArray(json.faqs)
        ? json.faqs
        : Array.isArray(json)
          ? json
          : [];

    const categories: FaqParsedCategory[] = rawCategories.map((c, i) => ({
      id: c.id || `cat_${i + 1}`,
      name_ar: c.name_ar || c.name || `قسم ${i + 1}`,
      name_en: c.name_en || "",
      sort_order: c.sort_order ?? i + 1,
      published: c.published ?? true,
    }));

    const faqs: FaqParsedItem[] = rawFaqs.map((f, i) => ({
      id: f.id || `faq_${i + 1}_${Date.now()}`,
      category_id: f.category_id || categories[0]?.id || "cat_general",
      question_ar: f.question_ar || f.question || `سؤال ${i + 1}`,
      question_en: f.question_en || "",
      answer_ar: f.answer_ar || f.answer || "",
      answer_en: f.answer_en || "",
      keywords: f.keywords || "",
      featured: Boolean(f.featured),
      published: f.published ?? true,
      sort_order: f.sort_order ?? i + 1,
    }));

    return {
      schemaType: "faq",
      success: true,
      rawText: text,
      data: { categories, faqs },
      issues,
      stats: {
        totalItems: faqs.length,
        totalFieldsDetected: Object.keys(json).length,
        totalSectionsOrSteps: categories.length,
        hasErrors: false,
      },
    };
  }

  const kv = extractKeyValues(text);
  const categories: FaqParsedCategory[] = [];
  const faqs: FaqParsedItem[] = [];

  // 1. Detect categories (category.1.id=, category.1.name_ar=)
  const catIndices = new Set<number>();
  for (const k of Object.keys(kv)) {
    const match = k.match(/^category\.(\d+)\./);
    if (match) catIndices.add(Number(match[1]));
  }
  for (const cIdx of Array.from(catIndices).sort((a, b) => a - b)) {
    const cId = kv[`category.${cIdx}.id`] || `cat_${cIdx}`;
    const nameAr = kv[`category.${cIdx}.name_ar`] || kv[`category.${cIdx}.name`] || `القسم ${cIdx}`;
    categories.push({
      id: cId,
      name_ar: nameAr,
      name_en: kv[`category.${cIdx}.name_en`] || "",
      sort_order: cIdx,
      published: true,
    });
  }

  // Fallback default category if none defined
  if (categories.length === 0) {
    categories.push({
      id: "cat_general",
      name_ar: "الأسئلة العامة",
      name_en: "General FAQs",
      sort_order: 1,
      published: true,
    });
  }

  // 2. Detect FAQs (faq.1.question_ar, faq.1.answer_ar...)
  const faqIndices = new Set<number>();
  for (const k of Object.keys(kv)) {
    const match = k.match(/^faq\.(\d+)\./);
    if (match) faqIndices.add(Number(match[1]));
  }

  for (const fIdx of Array.from(faqIndices).sort((a, b) => a - b)) {
    const qAr = kv[`faq.${fIdx}.question_ar`] || kv[`faq.${fIdx}.question`];
    const aAr = kv[`faq.${fIdx}.answer_ar`] || kv[`faq.${fIdx}.answer`];

    if (!qAr) {
      issues.push({
        severity: "warning",
        field: `faq.${fIdx}.question_ar`,
        messageAr: `السؤال رقم ${fIdx} فارغ، تم تخطيه`,
        messageEn: `FAQ question #${fIdx} is missing and was skipped`,
      });
      continue;
    }

    const catId = kv[`faq.${fIdx}.category_id`] || categories[0]?.id || "cat_general";
    const isFeatured = kv[`faq.${fIdx}.featured`]?.toLowerCase() === "true";

    faqs.push({
      id: kv[`faq.${fIdx}.id`] || `faq_${fIdx}_${Date.now().toString(36)}`,
      category_id: catId,
      question_ar: qAr,
      question_en: kv[`faq.${fIdx}.question_en`] || "",
      answer_ar: aAr || "",
      answer_en: kv[`faq.${fIdx}.answer_en`] || "",
      keywords: kv[`faq.${fIdx}.keywords`] || "",
      featured: isFeatured,
      published: true,
      sort_order: fIdx,
    });
  }

  if (faqs.length === 0) {
    issues.push({
      severity: "error",
      field: "faq.1.question_ar",
      messageAr: "لم يتم العثور على أي أسئلة في القالب (faq.1.question_ar=...)",
      messageEn: "No FAQ questions detected in the template",
    });
  }

  return {
    schemaType: "faq",
    success: issues.filter((i) => i.severity === "error").length === 0,
    rawText: text,
    data: { categories, faqs },
    issues,
    stats: {
      totalItems: faqs.length,
      totalFieldsDetected: Object.keys(kv).length,
      totalSectionsOrSteps: categories.length,
      hasErrors: issues.some((i) => i.severity === "error"),
    },
  };
}

/**
 * 4. Parser for Purchase Policy & Rights
 */
export function parsePurchasePolicy(text: string): ServiceParseResult<PolicyParseResultData> {
  const issues: ParsedIssue[] = [];
  const json = tryParseJson(text);

  if (json) {
    const rawPolicy = json.policy || json;
    const rawSections: any[] = Array.isArray(rawPolicy.sections) ? rawPolicy.sections : [];

    const sections: PolicyParsedSection[] = rawSections.map((sec, i) => ({
      id: sec.id || `sec_${i + 1}`,
      title_ar: sec.title_ar || sec.title || `بند رقم ${i + 1}`,
      title_en: sec.title_en || "",
      body_ar: sec.body_ar || sec.body || "",
      body_en: sec.body_en || "",
      highlight: Boolean(sec.highlight),
      sort_order: sec.sort_order ?? i + 1,
    }));

    const result: PolicyParseResultData = {
      title_ar: rawPolicy.title_ar || rawPolicy.title || "سياسة الشراء وحقوق الضمان",
      title_en: rawPolicy.title_en || "",
      subtitle_ar: rawPolicy.subtitle_ar || rawPolicy.subtitle || "",
      subtitle_en: rawPolicy.subtitle_en || "",
      version: rawPolicy.version || "v2.4",
      effective_date: rawPolicy.effective_date || new Date().toISOString().slice(0, 10),
      important_notices: rawPolicy.important_notices || "",
      contact_note: rawPolicy.contact_note || "",
      sections,
    };

    return {
      schemaType: "purchase_policy",
      success: true,
      rawText: text,
      data: result,
      issues,
      stats: {
        totalItems: sections.length,
        totalFieldsDetected: Object.keys(json).length,
        totalSectionsOrSteps: sections.length,
        hasErrors: false,
      },
    };
  }

  const kv = extractKeyValues(text);
  const sections: PolicyParsedSection[] = [];

  const secIndices = new Set<number>();
  for (const k of Object.keys(kv)) {
    const match = k.match(/^section\.(\d+)\./);
    if (match) secIndices.add(Number(match[1]));
  }

  for (const sIdx of Array.from(secIndices).sort((a, b) => a - b)) {
    const titleAr = kv[`section.${sIdx}.title_ar`] || kv[`section.${sIdx}.title`];
    const bodyAr = kv[`section.${sIdx}.body_ar`] || kv[`section.${sIdx}.body`];
    const isHighlight = kv[`section.${sIdx}.highlight`]?.toLowerCase() === "true";

    if (!titleAr) {
      issues.push({
        severity: "warning",
        field: `section.${sIdx}.title_ar`,
        messageAr: `البند رقم ${sIdx} لا يحتوي على عنوان، تم تخطيه`,
        messageEn: `Policy section #${sIdx} is missing a title and was skipped`,
      });
      continue;
    }

    sections.push({
      id: kv[`section.${sIdx}.id`] || `sec_${sIdx}_${Date.now().toString(36)}`,
      title_ar: titleAr,
      title_en: kv[`section.${sIdx}.title_en`] || "",
      body_ar: bodyAr || "",
      body_en: kv[`section.${sIdx}.body_en`] || "",
      highlight: isHighlight,
      sort_order: sIdx,
    });
  }

  const titleAr = kv["title_ar"] || kv["title"] || "سياسة الشراء والضمان وحقوق العملاء";

  const result: PolicyParseResultData = {
    title_ar: titleAr,
    title_en: kv["title_en"] || "",
    subtitle_ar: kv["subtitle_ar"] || kv["subtitle"] || "",
    subtitle_en: kv["subtitle_en"] || "",
    version: kv["version"] || "v2.4",
    effective_date: kv["effective_date"] || new Date().toISOString().slice(0, 10),
    important_notices: kv["important_notices"] || "",
    contact_note: kv["contact_note"] || "",
    sections,
  };

  if (sections.length === 0) {
    issues.push({
      severity: "warning",
      field: "section.1.title_ar",
      messageAr: "لم يتم العثور على بنود مفصلة (section.1.title_ar=...)",
      messageEn: "No policy sections detected in template",
    });
  }

  return {
    schemaType: "purchase_policy",
    success: true,
    rawText: text,
    data: result,
    issues,
    stats: {
      totalItems: sections.length,
      totalFieldsDetected: Object.keys(kv).length,
      totalSectionsOrSteps: sections.length,
      hasErrors: false,
    },
  };
}

/**
 * Universal dispatcher
 */
export function parseServiceTemplate(type: ServiceSectionType, text: string): ServiceParseResult {
  switch (type) {
    case "troubleshooting":
      return parseTroubleshooting(text);
    case "registration_guides":
      return parseRegistrationGuides(text);
    case "faq":
      return parseFaq(text);
    case "purchase_policy":
      return parsePurchasePolicy(text);
  }
}
