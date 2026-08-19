/**
 * Built-in troubleshooting knowledge base.
 *
 * This is the starter set so the assistant works today. Admin-managed articles
 * (settings.guides) are merged on top of it, and a full knowledge-base editor
 * lands with the dedicated admin pages later.
 *
 * Hard rule enforced here: no article ever asks a user to sign out of the
 * delivered account.
 */

import type { KbArticle } from "./types";

export const BUILTIN_ARTICLES: KbArticle[] = [
  {
    id: "kb_login_failed",
    title: "الحساب لا يقبل تسجيل الدخول",
    match: [
      "لا يعمل الحساب",
      "ماكو حساب",
      "مايدخل",
      "الباس غلط",
      "كلمة المرور غلط",
      "خطا تسجيل الدخول",
      "wrong password",
      "cant login",
    ],
    ask: "هل تظهر رسالة «كلمة مرور خاطئة» أم أن الشاشة تتوقف عند التحميل؟",
    steps: [
      "انسخ البريد وكلمة المرور من رسالة التسليم في محادثة الطلب كما هي تماماً بدون مسافة زائدة.",
      "من الجهاز: الإعدادات ← المستخدمون ← إضافة مستخدم ← ربط حساب نينتندو موجود.",
      "أدخل البريد أولاً واضغط التالي، ثم الصق كلمة المرور (لا تكتبها يدوياً).",
      "إن ظهر طلب رمز تحقق أخبرني هنا فوراً وسأرسله لك خلال دقائق.",
    ],
    errorCodes: ["2124-4508", "2811-7503"],
  },
  {
    id: "kb_needs_internet",
    title: "اللعبة تطلب اتصالاً أو لا تفتح",
    match: [
      "مايفتح",
      "ما تفتح",
      "تطلب انترنت",
      "تحتاج انترنت",
      "اوفلاين",
      "اللعبه ما تشتغل",
      "not opening",
      "needs internet",
    ],
    ask: "هل اللعبة نسخة رقمية من حساب ثانوي؟ وهل الجهاز متصل بالإنترنت الآن؟",
    steps: [
      "شغّل وضع الطيران ثم افتح اللعبة (هكذا تعمل نسخة الحساب الثانوي بلا تحقق).",
      "تأكد أنك تفتح اللعبة من نفس المستخدم المرتبط بحسابنا على الجهاز.",
      "حدّث اللعبة: اضغط + على أيقونتها ← تحديث البرنامج ← عبر الإنترنت.",
      "أعد تشغيل الجهاز ضغطاً مطولاً على زر الطاقة ← إعادة التشغيل، ثم افتح اللعبة.",
    ],
    errorCodes: ["2137-8056", "2110-3127"],
  },
  {
    id: "kb_primary_device",
    title: "تعيين أو نقل الجهاز الرئيسي",
    match: ["الجهاز الرئيسي", "primary", "نقل الحساب", "جهاز ثاني", "بريمري"],
    steps: [
      "لا تُغيّر إعداد الجهاز الرئيسي من داخل الحساب بنفسك — أخبرنا فقط.",
      "أرسل رقم الطلب واسم اللعبة هنا وسنعيد التعيين للجهاز الجديد من طرفنا.",
      "بعد إعادة التعيين افتح اللعبة مرة واحدة والجهاز متصل بالإنترنت.",
    ],
  },
  {
    id: "kb_verification_code",
    title: "الجهاز يطلب رمز تحقق",
    match: ["رمز التحقق", "كود التحقق", "يطلب كود", "verification code"],
    steps: [
      "لا تُغلق شاشة إدخال الرمز.",
      "اكتب هنا «أحتاج رمز التحقق» مع رقم الطلب وسنجلبه من بريد الحساب فوراً.",
      "الرمز صالح لدقائق قصيرة، فأدخله مباشرة بعد وصوله.",
    ],
  },
  {
    id: "kb_download_stuck",
    title: "التحميل متوقف أو بطيء",
    match: ["التحميل واقف", "التنزيل بطيء", "ما يكمل التحميل", "download stuck", "slow download"],
    steps: [
      "من الشاشة الرئيسية: أوقف التحميل مؤقتاً ثم أعد تشغيله.",
      "الإعدادات ← النظام ← إعدادات التخزين ← تأكد من وجود مساحة كافية.",
      "قرّب الجهاز من الراوتر أو استخدم شبكة 5GHz، ثم أعد تشغيل الجهاز.",
    ],
    errorCodes: ["2124-8028"],
  },
  {
    id: "kb_payment_rejected",
    title: "الوصل مرفوض أو الدفع لم يُعتمد",
    match: ["الوصل مرفوض", "الدفع مرفوض", "ما تاكد الدفع", "receipt rejected"],
    steps: [
      "أرسل صورة كاملة وواضحة للوصل تظهر فيها القيمة والتاريخ ورقم العملية.",
      "تأكد أن المبلغ مطابق لإجمالي الطلب تماماً.",
      "إن كان التحويل من محفظة شخص آخر اذكر اسمه هنا لنطابقه.",
    ],
  },
];

/** Admin guides (settings.guides) converted into articles. */
export function articlesFromGuides(
  guides: { title?: string; body?: string; imageUrl?: string }[] | undefined,
): KbArticle[] {
  return (guides ?? [])
    .filter((guide) => guide.title?.trim())
    .map((guide, index) => ({
      id: `kb_admin_${index}`,
      title: String(guide.title),
      match: [String(guide.title)],
      steps: String(guide.body ?? "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
      ...(guide.imageUrl ? { imageUrl: guide.imageUrl } : {}),
    }));
}

/** Admin knowledge-base articles (settings.kbArticles) → engine articles. */
export function articlesFromAdmin(
  rows:
    | {
        id?: string;
        title?: string;
        match?: string;
        ask?: string;
        steps?: string;
        errorCodes?: string;
        imageUrl?: string;
        escalate?: boolean;
      }[]
    | undefined,
): KbArticle[] {
  const split = (value: string | undefined) =>
    String(value ?? "")
      .split(/[\n,،]+/)
      .map((part) => part.trim())
      .filter(Boolean);

  return (rows ?? [])
    .filter((row) => row.title?.trim())
    .map((row, index) => ({
      id: row.id?.trim() || `kb_admin_${index}`,
      title: String(row.title),
      match: [...split(row.match), String(row.title)],
      ...(row.ask?.trim() ? { ask: row.ask.trim() } : {}),
      steps: split(row.steps),
      ...(split(row.errorCodes).length ? { errorCodes: split(row.errorCodes) } : {}),
      ...(row.imageUrl?.trim() ? { imageUrl: row.imageUrl.trim() } : {}),
      ...(row.escalate ? { escalate: true } : {}),
    }));
}

/** Article registered for a device error code (admin articles win). */
export function pickArticleForCode(code: string, articles: KbArticle[]): KbArticle | undefined {
  const wanted = code.replace(/\s/g, "");
  const matches = articles.filter((article) =>
    (article.errorCodes ?? []).some((entry) => entry.replace(/\s/g, "") === wanted),
  );
  return matches.find((article) => article.id.startsWith("kb_admin")) ?? matches[0];
}
