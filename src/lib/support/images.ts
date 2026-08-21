/**
 * Screenshot handling — multilingual and robust.
 */

import { pickArticleForCode } from "./kb";
import { detectLang, findErrorCode } from "./normalize";
import type { SupportContext, SupportReply, SupportMemory, KbArticle, SupportLang } from "./types";
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
  const lang: SupportLang = detectLang(caption, context.lang ?? "ar");

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
    suggestions:
      options.suggestions ??
      (lang === "en"
        ? ["Talk to Support"]
        : lang === "ku"
          ? ["Bi piştgiriyê re biaxive"]
          : lang === "tr"
            ? ["Destekle Görüş"]
            : ["تحدث مع الدعم"]),
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
      const header =
        lang === "en"
          ? `Error Code ${code} — ${article.title}:`
          : `رمز الخطأ ${code} — ${article.title}:`;
      return reply(
        [
          header,
          ...article.steps.map((step: string, index: number) => `${index + 1}. ${step}`),
        ].join("\n"),
        {
          articleId: article.id,
          code,
          suggestions: [
            lang === "en" ? "Still not working" : "جربت وما نفع",
            lang === "en" ? "Talk to Support" : "تحدث مع الدعم",
          ],
          reason: "image_error_code_article",
        },
      );
    }

    const unknownText =
      lang === "en"
        ? `I received error code ${code}. I am forwarding your screenshot and error code to our support admin now for immediate manual resolution.`
        : `وصلني رمز الخطأ ${code} وهو غير مسجّل عندي بحل جاهز — سأحوّل الصورة والرمز للإدارة الآن لمساعدتك مباشرة.`;

    return reply(unknownText, {
      code,
      escalate: true,
      suggestions: [lang === "en" ? "Talk to Support" : "تحدث مع الدعم"],
      reason: "image_unknown_error_code",
    });
  }

  // 2) Second screenshot with no signal → hand off to a human
  if (input.imageCount >= 2) {
    const handoffText =
      lang === "en"
        ? "Images received! I am escalating this conversation to our support team so an admin can view the screenshots directly and reply here."
        : "وصلتني الصور ✅ سأحوّلك للإدارة ليطّلع المشرف على الصورة بنفسه ويجيبك هنا في نفس المحادثة.";

    return reply(handoffText, {
      escalate: true,
      suggestions: [lang === "en" ? "Talk to Support" : "تحدث مع الدعم"],
      reason: "image_repeated_no_signal",
    });
  }

  // 3) First screenshot without code → prompt for code or details
  const msg =
    lang === "en"
      ? "Image received! ✅ To provide the exact fix, please type the error code shown on your screen (e.g. 2124-4508) or describe the error message."
      : "وصلتني الصورة ✅ لأعطيك الحل الصحيح، اكتب لي رمز الخطأ الظاهر في الصورة (مثال 2124-4508) أو نص الرسالة.";

  return reply(msg, {
    suggestions: [lang === "en" ? "Talk to Support" : "تحدث مع الدعم"],
    reason: "image_first_screenshot_ask_code",
  });
}
