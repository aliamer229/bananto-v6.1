/**
 * Screenshot handling — fully local, no external vision API.
 *
 * The user sends a photo of the console screen. We cannot read pixels here, so
 * instead of guessing we do three deterministic things:
 *  1. Read any error code the user typed in the caption (or a previous turn).
 *  2. If the caption is empty, ask one precise question (the error code / the
 *     exact line on screen) and offer the most likely article for this order.
 *  3. After two screenshots without a usable signal, hand off to the admin with
 *     an internal note, because a human can simply look at the image.
 */

import { pickArticleForCode } from "./kb";
import { findErrorCode } from "./normalize";
import type { SupportContext, SupportReply, SupportMemory, KbArticle } from "./types";
import { emptyMemory } from "./types";

export function imageAnswer(
  input: {
    caption?: string;
    /** how many screenshots the user already sent in this thread */
    imageCount: number;
  },
  context: SupportContext,
): SupportReply {
  const memory: SupportMemory = context.memory ?? emptyMemory();
  const caption = input.caption ?? "";
  const code = findErrorCode(caption) ?? memory.lastErrorCode;
  const articles: KbArticle[] = context.articles ?? [];

  const reply = (
    text: string,
    options: {
      suggestions?: string[];
      escalate?: boolean;
      articleId?: string;
      reason: string;
      code?: string;
    },
  ): SupportReply => ({
    text,
    cards: [],
    suggestions: options.suggestions ?? [],
    escalate: Boolean(options.escalate),
    memory: {
      ...memory,
      ...(options.code ? { lastErrorCode: options.code } : {}),
      offeredArticles: options.articleId
        ? [...new Set([...memory.offeredArticles, options.articleId])]
        : memory.offeredArticles,
    },
    trace: {
      intent: "unknown",
      candidates: [],
      confidence: code ? "high" : "low",
      reason: options.reason,
      ...(options.articleId ? { articleId: options.articleId } : {}),
      ...(options.code ? { errorCode: options.code } : {}),
    },
  });

  // 1) A real error code → answer straight from the knowledge base.
  if (code) {
    const article = pickArticleForCode(code, articles);
    if (article) {
      return reply(
        [
          `رمز الخطأ ${code} — ${article.title}:`,
          ...article.steps.map((step: string, index: number) => `${index + 1}. ${step}`),
        ].join("\n"),
        {
          articleId: article.id,
          code,
          suggestions: ["جربت وما نفع", "تحدث مع الدعم"],
          reason: "image_error_code_article",
        },
      );
    }
    return reply(
      `وصلني رمز الخطأ ${code} وهو غير مسجّل عندي بحل جاهز — سأحوّل الصورة والرمز للأدمن الآن ليحلّها لك مباشرة.`,
      { code, escalate: true, suggestions: ["تحدث مع الدعم"], reason: "image_unknown_error_code" },
    );
  }

  // 3) Second screenshot with no signal → a human should just look at it.
  if (input.imageCount >= 2) {
    return reply(
      "وصلتني الصور. لأسرّع الحل سأحوّلك للأدمن ليطّلع على الصورة بنفسه ويجيبك هنا في نفس المحادثة.",
      { escalate: true, suggestions: ["تحدث مع الدعم"], reason: "image_repeated_no_signal" },
    );
  }

  // 2) First screenshot → ask one precise question, plus the likeliest guide.
  const likely = context.activeOrder?.needsAddress
    ? articles.find((article) => article.id === "kb_download_stuck")
    : articles.find((article) => article.id === "kb_login_failed");

  const lines = [
    "وصلتني الصورة ✅ لأعطيك الحل الصحيح بدون تخمين، اكتب لي رمز الخطأ الظاهر في الصورة (مثال 2124-4508) أو انسخ لي نص الرسالة كما هو.",
  ];
  if (likely) {
    lines.push("", `وإن كانت المشكلة «${likely.title}» جرّب الآن:`, `1. ${likely.steps[0]}`);
  }

  return reply(lines.join("\n"), {
    ...(likely ? { articleId: likely.id } : {}),
    suggestions: ["رمز الخطأ", "الحساب لا يعمل", "تحدث مع الدعم"],
    reason: "image_needs_error_code",
  });
}
