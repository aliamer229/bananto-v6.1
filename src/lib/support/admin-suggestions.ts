import { detect } from "./intent";
import type { SupportContext, SupportIntent, SafeOrder } from "./types";

/**
 * Ranked reply suggestions for the staff member answering a conversation.
 *
 * The point is that staff should not have to read back through a thread to work
 * out what the customer is waiting for. Suggestions are derived from two
 * signals rather than a fixed menu:
 *
 *   - what the customer actually wrote, through the same intent detector the
 *     automated assistant uses, so the wording of the question drives the
 *     ranking;
 *   - where the order genuinely stands (paid, credentials sent, proof
 *     received), so a reply that makes no sense right now is never offered.
 *
 * This module is pure: it takes an already-sanitised context and returns text.
 * It reads no database and produces nothing the customer could not be told.
 */

export interface AdminSuggestion {
  /** Stable id so the UI can keep keys and telemetry consistent. */
  id: string;
  /** Ready-to-send reply. */
  text: string;
  /** Why it is being offered — shown to staff as a small hint. */
  reason: string;
  /** Higher sorts first. */
  score: number;
}

export interface AdminSuggestionInput {
  /** Conversation so far, oldest first. */
  messages: { senderRole: string; text?: string; kind?: string; createdAt?: string }[];
  ctx: SupportContext;
  order?: SafeOrder;
}

type Lang = SupportContext["lang"];

const COPY: Record<string, Record<"ar" | "en", string>> = {
  ack_checking: {
    ar: "أتحقق من طلبك الآن وأعود إليك خلال دقائق.",
    en: "I'm checking your order now and will get back to you in a few minutes.",
  },
  payment_pending: {
    ar: "لم نستلم تأكيد الدفع بعد. أرسل صورة إيصال التحويل من زر المرفقات وسنؤكده فوراً.",
    en: "We haven't received payment confirmation yet. Send the transfer receipt using the attachment button and we'll confirm it right away.",
  },
  payment_confirmed: {
    ar: "تم تأكيد الدفع ✅ ويجري تجهيز طلبك الآن.",
    en: "Payment confirmed ✅ your order is being prepared now.",
  },
  creds_coming: {
    ar: "جاري تجهيز بيانات الحساب وسنرسلها هنا فور جاهزيتها.",
    en: "Your account details are being prepared and will be sent here as soon as they're ready.",
  },
  creds_sent: {
    ar: "أرسلنا بيانات الحساب في هذه المحادثة. سجّل الدخول ثم أرسل لنا صورة إثبات التسجيل.",
    en: "We've sent the account details in this conversation. Sign in, then send us a screenshot of the registration.",
  },
  ask_proof: {
    ar: "من فضلك أرسل صورة تؤكد تسجيل الدخول للحساب لنكمل الخطوة التالية.",
    en: "Please send a screenshot confirming you signed in so we can move to the next step.",
  },
  send_code: {
    ar: "سنرسل رمز التحقق هنا خلال لحظات، انتظر قليلاً من فضلك.",
    en: "We'll post the verification code here in a moment, please hold on.",
  },
  login_help: {
    ar: "جرّب تسجيل الخروج ثم الدخول مرة أخرى، وتأكد من كتابة البريد وكلمة المرور كما أُرسلا تماماً. أخبرنا بنص رسالة الخطأ إن ظهرت.",
    en: "Try signing out and back in, and make sure the email and password are entered exactly as sent. Tell us the exact error message if one appears.",
  },
  primary_device: {
    ar: "لتشغيل اللعبة دون إنترنت يجب ضبط الجهاز كجهاز رئيسي للحساب. أخبرنا إن أردت خطوات الضبط بالتفصيل.",
    en: "To play offline the console must be set as the primary device for the account. Tell us if you'd like the exact steps.",
  },
  delivery_address: {
    ar: "أكد لنا العنوان ورقم الهاتف للتوصيل وسنجهّز الشحن.",
    en: "Please confirm your delivery address and phone number and we'll arrange shipping.",
  },
  refund_policy: {
    ar: "سأراجع حالة الطلب وأوضح لك الخيارات المتاحة حسب سياسة الاسترجاع.",
    en: "I'll review the order and explain the options available under the refund policy.",
  },
  wallet_topup: {
    ar: "طلب التعبئة قيد المراجعة، ويُضاف الرصيد فور تأكيد التحويل.",
    en: "Your top-up is under review; the balance is credited as soon as the transfer is confirmed.",
  },
  apology_wait: {
    ar: "نعتذر عن التأخير، طلبك عندنا ونحن نتابعه الآن.",
    en: "Sorry for the wait — your order is with us and we're on it now.",
  },
  closing: {
    ar: "هل تحتاج أي شيء آخر قبل أن نغلق التذكرة؟",
    en: "Is there anything else you need before we close this ticket?",
  },
  greeting: {
    ar: "أهلاً بك 👋 كيف أقدر أساعدك؟",
    en: "Hello 👋 how can I help?",
  },
};

function say(key: keyof typeof COPY, lang: Lang): string {
  const entry = COPY[key]!;
  return lang === "en" ? entry.en : entry.ar;
}

/** Frustration / repetition markers, in the dialects members actually type. */
const IMPATIENCE = [
  "متى",
  "وين",
  "تاخير",
  "تأخير",
  "طولتو",
  "طولتم",
  "كم صار",
  "لليوم",
  "ما وصل",
  "ماوصل",
  "مو راضي",
  "زعلان",
  "how long",
  "still waiting",
  "any update",
  "not yet",
];

function lastCustomerText(messages: AdminSuggestionInput["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i]!;
    if (entry.senderRole === "user" && entry.text?.trim()) return entry.text.trim();
  }
  return "";
}

/** Intent-driven replies, keyed off what the customer actually asked. */
const BY_INTENT: Partial<Record<SupportIntent, { key: keyof typeof COPY; reason: string }[]>> = {
  greeting: [{ key: "greeting", reason: "greeting" }],
  order_status: [
    { key: "ack_checking", reason: "asked about order status" },
    { key: "creds_coming", reason: "asked about order status" },
  ],
  order_where: [{ key: "ack_checking", reason: "asked where the order is" }],
  payment_how: [{ key: "payment_pending", reason: "asked how to pay" }],
  payment_receipt: [{ key: "payment_confirmed", reason: "sent a receipt" }],
  delivery_address: [{ key: "delivery_address", reason: "delivery question" }],
  account_credentials: [
    { key: "creds_sent", reason: "asked for account details" },
    // "give me my account" and "I can't get into my account" are hard to tell
    // apart, so staff get both rather than the wrong one.
    { key: "login_help", reason: "may be a sign-in problem" },
  ],
  account_login_problem: [{ key: "login_help", reason: "sign-in problem" }],
  game_not_opening: [{ key: "primary_device", reason: "game will not start" }],
  primary_device: [{ key: "primary_device", reason: "primary device question" }],
  verification_code: [{ key: "send_code", reason: "asked for the verification code" }],
  refund_cancel: [{ key: "refund_policy", reason: "refund or cancellation" }],
  banana_wallet: [{ key: "wallet_topup", reason: "wallet question" }],
  thanks: [{ key: "closing", reason: "customer said thanks" }],
};

/**
 * Rank replies for the staff member. Highest-scoring first, de-duplicated,
 * capped at `limit`.
 */
export function suggestAdminReplies(input: AdminSuggestionInput, limit = 5): AdminSuggestion[] {
  const { messages, ctx } = input;
  const lang: Lang = ctx.lang ?? "ar";
  const order = input.order ?? ctx.activeOrder;
  const text = lastCustomerText(messages);

  const out: AdminSuggestion[] = [];
  const push = (key: keyof typeof COPY, reason: string, score: number) => {
    out.push({ id: key, text: say(key, lang), reason, score });
  };

  // 1. What they asked, through the assistant's own detector.
  if (text) {
    const detection = detect(text, ctx);
    for (const entry of BY_INTENT[detection.intent] ?? []) {
      push(entry.key, entry.reason, detection.confidence === "high" ? 100 : 80);
    }
  }

  // 2. Where the order actually stands. These outrank generic phrasing matches
  //    because they reflect what is really blocking the customer.
  if (order) {
    if (order.paymentStatus !== "paid") {
      push("payment_pending", "payment not confirmed yet", 95);
    }
    const awaitingProof = order.items.some((item) => item.credsSentAt && !item.completedAt);
    const nothingSent = order.items.some(
      (item) => !item.credsSentAt && item.kind.includes("account"),
    );
    if (order.paymentStatus === "paid" && nothingSent) {
      push("creds_coming", "paid, credentials not sent yet", 90);
    }
    if (awaitingProof) {
      push("ask_proof", "credentials sent, waiting on the customer's proof", 92);
    }
    if (order.needsAddress && !order.hasAddress) {
      push("delivery_address", "physical item with no address on file", 94);
    }
  }

  // 3. Conversation pattern: an impatient or repeated question deserves an
  //    apology before anything else.
  const lowered = text.toLowerCase();
  if (text && IMPATIENCE.some((marker) => lowered.includes(marker.toLowerCase()))) {
    push("apology_wait", "customer is chasing an update", 105);
  }

  // 4. Never leave staff with nothing.
  if (!out.length) {
    push("ack_checking", "default", 10);
    push("greeting", "default", 5);
  }

  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, limit);
}
