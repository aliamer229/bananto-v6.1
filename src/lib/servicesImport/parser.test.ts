import { describe, expect, it } from "vitest";
import {
  parseContact,
  parseFaq,
  parsePurchasePolicy,
  parseRegistrationGuides,
  parseServiceTemplate,
  parseTroubleshooting,
} from "./parser";
import {
  CONTACT_TEMPLATE,
  FAQ_TEMPLATE,
  PURCHASE_POLICY_TEMPLATE,
  REGISTRATION_GUIDES_TEMPLATE,
  TROUBLESHOOTING_TEMPLATE,
} from "./templates";

describe("Services Import Parser", () => {
  it("parses troubleshooting template successfully", () => {
    const result = parseTroubleshooting(TROUBLESHOOTING_TEMPLATE);
    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    expect(result.data[0]!.title).toContain("2124-4508");
    expect(result.data[0]!.steps.length).toBeGreaterThanOrEqual(4);
    expect(result.data[0]!.errorCodes).toContain("2124-4508");
    expect(result.stats.totalSectionsOrSteps).toBeGreaterThanOrEqual(7);
  });

  it("parses registration guides template successfully", () => {
    const result = parseRegistrationGuides(REGISTRATION_GUIDES_TEMPLATE);
    expect(result.success).toBe(true);
    expect(result.data.length).toBe(2);
    expect(result.data[0]!.title_ar).toContain("تفعيل الحساب الأساسي");
    expect(result.data[0]!.steps.length).toBe(4);
    expect(result.data[1]!.steps.length).toBe(3);
    expect(result.data[0]!.steps[0]!.title_ar).toContain("إضافة مستخدم جديد");
    expect(result.data[0]!.steps[1]!.warning_ar).toBeTruthy();
  });

  it("parses FAQ template with categories and questions", () => {
    const result = parseFaq(FAQ_TEMPLATE);
    expect(result.success).toBe(true);
    // 3 declared categories + 1 auto-created from a category name
    expect(result.data.categories.length).toBe(4);
    expect(result.data.categories[0]!.id).toBe("cat_accounts");
    expect(result.data.faqs.length).toBe(4);
    expect(result.data.faqs[0]!.question_ar).toContain("اللعب بحسابي الشخصي");
    expect(result.data.faqs[0]!.featured).toBe(true);
    expect(result.data.faqs[3]!.category_id).toBe(result.data.categories[3]!.id);
  });

  it("parses purchase policy and warranty template", () => {
    const result = parsePurchasePolicy(PURCHASE_POLICY_TEMPLATE);
    expect(result.success).toBe(true);
    expect(result.data.title_ar).toContain("سياسة الشراء");
    expect(result.data.sections.length).toBe(5);
    expect(result.data.sections[0]!.title_ar).toContain("الضمان الرسمي");
    expect(result.data.sections[0]!.highlight).toBe(true);
    expect(result.data.important_notices).toContain("يرجى قراءة بنود الشراء");
  });

  it("parses contact template with channels and services", () => {
    const result = parseContact(CONTACT_TEMPLATE);
    expect(result.success).toBe(true);
    expect(result.data.channels.length).toBe(5);
    expect(result.data.channels[0]!.href).toContain("wa.me");
    expect(result.data.channels[1]!.href).toContain("t.me");
    expect(result.data.services.length).toBe(3);
    expect(result.data.working_hours_ar).toBeTruthy();
  });

  it("auto-builds contact channels from shortcut fields", () => {
    const res = parseContact("whatsapp=+9647701112233\nemail=help@banan.to");
    expect(res.success).toBe(true);
    expect(res.data.channels.length).toBe(2);
    expect(res.data.channels[1]!.href).toBe("mailto:help@banan.to");
  });

  it("supports colon syntax, arabic booleans and custom heredoc terminators", () => {
    const res = parseFaq(
      [
        "category.1.id: cat_x",
        "category.1.name_ar: قسم تجريبي",
        "faq.1.question_ar: سؤال؟",
        "faq.1.answer_ar<<END",
        "جواب طويل",
        "END",
        "faq.1.featured: نعم",
      ].join("\n"),
    );
    expect(res.success).toBe(true);
    expect(res.data.faqs[0]!.answer_ar).toBe("جواب طويل");
    expect(res.data.faqs[0]!.featured).toBe(true);
    expect(res.data.faqs[0]!.category_id).toBe("cat_x");
  });

  it("handles universal dispatcher parseServiceTemplate", () => {
    const res = parseServiceTemplate("faq", FAQ_TEMPLATE);
    expect(res.schemaType).toBe("faq");
    expect(res.success).toBe(true);
  });

  it("handles JSON fallback for all templates", () => {
    const jsonPolicy = JSON.stringify({
      title_ar: "سياسة المتجر",
      sections: [{ title_ar: "بند 1", body_ar: "شرح 1" }],
    });
    const res = parsePurchasePolicy(jsonPolicy);
    expect(res.success).toBe(true);
    expect(res.data.title_ar).toBe("سياسة المتجر");
    expect(res.data.sections.length).toBe(1);
  });

  it("handles empty or invalid inputs gracefully", () => {
    const res = parseTroubleshooting("# Just comments\n# no title");
    expect(res.success).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
    expect(res.issues[0]!.severity).toBe("error");
  });
});
