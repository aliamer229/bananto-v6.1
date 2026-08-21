import { norm, surfaces } from "./normalize";
import type { SupportLang } from "./types";

/**
 * Requests the automated assistant must decline rather than attempt.
 *
 * The engine is already safe by construction — it is pure, it only ever sees
 * the asking member's own sanitised data, and it cannot write anything. What
 * was missing was the wording: asked for *another customer's* details it would
 * cheerfully answer about the asker's own account instead, and asked to change
 * a balance it would simply report the current one, which reads like the change
 * was considered.
 *
 * These are refusals with a hand-over, not security controls; the controls live
 * in the API guards.
 */
export type SensitiveKind = "other_customer" | "mutate_balance" | "staff_only";

/** Wanting someone else's data — never answerable, whoever is asking. */
const OTHER_CUSTOMER = [
  "حساب غيري",
  "حساب شخص",
  "حساب زبون",
  "ارقام الزباين",
  "أرقام الزبائن",
  "بيانات الزباين",
  "بيانات الزبائن",
  "معلومات زبون",
  "رصيد غيري",
  "رصيد شخص",
  "ايميلات الزباين",
  "قائمة المستخدمين",
  "another customer",
  "other customer",
  "customer list",
  "other users",
  "someone else account",
  "another user balance",
];

/** Asking the assistant to move money or change an order itself. */
const MUTATE = [
  "خلي رصيدي",
  "زيد رصيدي",
  "ضيف رصيد",
  "أضف رصيد",
  "اضف رصيد",
  "غير السعر",
  "غيّر السعر",
  "خصم لي",
  "الغي الطلب بنفسك",
  "حول فلوس",
  "set my balance",
  "add balance",
  "give me credit",
  "change the price",
  "refund me now",
];

/** Internal matters that belong to staff, not to a shopper-facing assistant. */
const STAFF_ONLY = [
  "كلفة المنتج",
  "سعر التكلفة",
  "من وين تجيبون",
  "المورد",
  "ارباحكم",
  "أرباحكم",
  "لوحة الادارة",
  "لوحة الإدارة",
  "supplier",
  "cost price",
  "your profit",
  "admin panel",
];

const GROUPS: { kind: SensitiveKind; phrases: string[] }[] = [
  { kind: "other_customer", phrases: OTHER_CUSTOMER },
  { kind: "mutate_balance", phrases: MUTATE },
  { kind: "staff_only", phrases: STAFF_ONLY },
];

export function detectSensitive(input: string): SensitiveKind | undefined {
  const forms = surfaces(input).map((form) => norm(form));
  for (const group of GROUPS) {
    for (const phrase of group.phrases) {
      const needle = norm(phrase);
      if (needle && forms.some((form) => form.includes(needle))) return group.kind;
    }
  }
  return undefined;
}

const COPY: Record<SensitiveKind, Record<"ar" | "en", string>> = {
  other_customer: {
    ar: "لا أستطيع الاطلاع على بيانات أي حساب آخر أو مشاركتها — أساعدك في حسابك وطلباتك أنت فقط.",
    en: "I can't look up or share any other account's details — I can only help with your own account and orders.",
  },
  mutate_balance: {
    ar: "لا أستطيع تعديل الرصيد أو الأسعار بنفسي. أرسل طلب التعبئة مع إثبات التحويل وسيؤكده فريق الدعم، أو اطلب التحويل للإدارة الآن.",
    en: "I can't change balances or prices myself. Submit a top-up request with your transfer receipt for the team to confirm, or ask me to hand you over to support.",
  },
  staff_only: {
    ar: "هذي معلومات داخلية ما أقدر أشاركها. أقدر أساعدك بأسعار البيع والتوفر وتفاصيل طلبك.",
    en: "That's internal information I can't share. I can help with retail prices, availability and your order details.",
  },
};

export function sensitiveReply(kind: SensitiveKind, lang: SupportLang): string {
  const entry = COPY[kind];
  return lang === "en" ? entry.en : entry.ar;
}
