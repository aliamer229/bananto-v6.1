/**
 * Reply generation.
 *
 * Everything here is produced from the sanitised `SupportContext`. The engine
 * never invents an order state, a tracking step, an error code or account data:
 * when it does not know, it asks one question or escalates to a human.
 */

import { detect, findProducts, type Detection } from "./intent";
import { BUILTIN_ARTICLES } from "./kb";
import { INTENT_PHRASES } from "./lexicon";
import { detectLang, matchAny, norm, surfaces } from "./normalize";
import {
  emptyMemory,
  type KbArticle,
  type SafeOrder,
  type SupportCard,
  type SupportContext,
  type SupportIntent,
  type SupportMemory,
  type SupportReply,
} from "./types";

const STATUS_AR: Record<string, string> = {
  pending: "بانتظار الدفع",
  processing: "قيد التجهيز",
  delivering: "قيد التسليم",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const PAYMENT_AR: Record<string, string> = {
  unpaid: "لم يتم الدفع",
  review: "قيد مراجعة الوصل",
  paid: "مدفوع",
  rejected: "الوصل مرفوض",
};

const money = (value: number, symbol: string) =>
  `${Math.round(value).toLocaleString("en-US")} ${symbol}`;

function productCard(product: SupportContext["products"][number], symbol: string): SupportCard {
  const bits = [
    product.price > 0 ? `السعر: ${money(product.price, symbol)}` : "السعر يحدده الدعم",
    product.genre ? `التصنيف: ${product.genre}` : "",
    product.size ? `الحجم: ${product.size}` : "",
    product.kind === "hardware" ? "يحتاج عنوان للتوصيل" : "تسليم داخل محادثة الطلب",
  ].filter(Boolean);
  return {
    kind: "product",
    id: product.id,
    name: product.title,
    text: bits.join(" · "),
    ...(product.image ? { image: product.image } : {}),
  };
}

function orderLines(order: SafeOrder, symbol: string): string {
  const items = order.items.map((item) => `${item.title} ×${item.quantity}`).join("، ");
  const lines = [
    `طلبك ${order.code}: ${STATUS_AR[order.status] ?? order.status} · الدفع: ${
      PAYMENT_AR[order.paymentStatus] ?? order.paymentStatus
    }`,
    `المنتجات: ${items}`,
    `الإجمالي: ${money(order.total, order.currency || symbol)}`,
  ];
  if (order.needsAddress) {
    lines.push(
      order.hasAddress
        ? `عنوان التوصيل مسجّل${order.addressSummary ? `: ${order.addressSummary}` : ""} ويجري تجهيز الشحن.`
        : "ينقصنا عنوان التوصيل — أرسله هنا (المحافظة، المنطقة، أقرب نقطة دالة، رقم الهاتف).",
    );
  } else {
    const delivered = order.items.filter((item) => item.credsSentAt);
    lines.push(
      delivered.length
        ? `تم تسليم بيانات ${delivered.length} من ${order.items.length} داخل هذه المحادثة.`
        : "التسليم رقمي داخل محادثة الطلب مباشرة بعد تأكيد الدفع.",
    );
  }
  return lines.join("\n");
}

/** Pick the best knowledge-base article, skipping ones already offered. */
function pickArticle(
  input: string,
  detection: Detection,
  articles: KbArticle[],
  memory: SupportMemory,
  forcedId?: string,
): { article?: KbArticle; strong: boolean } {
  if (forcedId) {
    const forced = articles.find((article) => article.id === forcedId);
    if (forced) return { article: forced, strong: true };
  }
  const forms = surfaces(input);
  const scored = articles
    .map((article) => {
      let score = 0;
      if (detection.errorCode && (article.errorCodes ?? []).includes(detection.errorCode))
        score += 10;
      if (matchAny(forms, article.match)) score += 4;
      if (matchAny(forms, [article.title])) score += 3;
      if (memory.offeredArticles.includes(article.id)) score -= 5;
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return { strong: false };
  return { article: best.article, strong: best.score >= 7 };
}

const englishOf: Record<string, string> = {
  طلبك: "Your order",
};

/** Resolved understanding coming from the AI layer (server side). */
export interface SupportHintInput {
  intent?: SupportIntent;
  productId?: string;
  articleId?: string;
  orderCode?: string;
  errorCode?: string;
  needsHuman?: boolean;
}

export function supportAnswer(
  input: string,
  context: SupportContext,
  hint?: SupportHintInput,
): SupportReply {
  const ctx: SupportContext = {
    ...context,
    memory: context.memory ?? emptyMemory(),
    articles: context.articles?.length ? context.articles : BUILTIN_ARTICLES,
  };
  const symbol = ctx.currencySymbol || "د.ع";
  const lang = detectLang(input, ctx.lang ?? "ar");
  const base = detect(input, ctx);

  // The AI understanding wins over keyword rules when it resolved something.
  const hintedProduct = hint?.productId
    ? ctx.products.find((product) => product.id === hint.productId)
    : undefined;
  const hintedOrder = hint?.orderCode
    ? ctx.orders.find((order) => order.code === hint.orderCode)
    : undefined;
  const detection: Detection = {
    ...base,
    ...(hint?.needsHuman ? { intent: "human_agent", confidence: "high" } : {}),
    ...(!hint?.needsHuman && hint?.intent && hint.intent !== "unknown"
      ? { intent: hint.intent, confidence: "high" }
      : {}),
    ...(hintedProduct ? { products: [hintedProduct] } : {}),
    ...(hintedOrder ? { order: hintedOrder, orderCode: hintedOrder.code } : {}),
    ...(hint?.errorCode ? { errorCode: hint.errorCode } : {}),
  };

  const memory: SupportMemory = {
    ...ctx.memory,
    ...(detection.order ? { focusOrderCode: detection.order.code } : {}),
    ...(detection.products[0] ? { focusProductId: detection.products[0].id } : {}),
  };

  const build = (
    text: string,
    options: {
      cards?: SupportCard[];
      suggestions?: string[];
      escalate?: boolean;
      articleId?: string;
      reason: string;
      asked?: string;
      memory?: Partial<SupportMemory>;
    },
  ): SupportReply => {
    const nextMemory: SupportMemory = {
      ...memory,
      ...(options.memory ?? {}),
      offeredArticles: options.articleId
        ? [...new Set([...memory.offeredArticles, options.articleId])]
        : memory.offeredArticles,
      askedQuestions: options.asked
        ? [...new Set([...memory.askedQuestions, options.asked])]
        : memory.askedQuestions,
    };
    return {
      text: lang === "en" ? text.replace(/طلبك/g, englishOf["طلبك"] ?? "طلبك") : text,
      cards: options.cards ?? [],
      suggestions: options.suggestions ?? [],
      escalate: Boolean(options.escalate),
      memory: nextMemory,
      trace: {
        intent: detection.intent,
        candidates: detection.candidates,
        confidence: detection.confidence,
        reason: options.reason,
        ...(options.articleId ? { articleId: options.articleId } : {}),
        ...(detection.orderCode ? { orderCode: detection.orderCode } : {}),
        ...(detection.products[0] ? { productId: detection.products[0].id } : {}),
        ...(detection.errorCode ? { errorCode: detection.errorCode } : {}),
      },
    };
  };

  const escalate = (reason: string, note: string) =>
    build(note, {
      escalate: true,
      suggestions: ["تحدث مع الدعم"],
      reason,
    });

  if (!norm(input)) {
    return build("اكتب سؤالك وسأساعدك 👋", {
      suggestions: ["حالة طلبي", "كيف أشتري؟", "أبحث عن لعبة"],
      reason: "empty_input",
    });
  }

  switch (detection.intent) {
    case "human_agent":
      return escalate(
        "user_requested_human",
        "سأحوّلك إلى فريق الدعم الآن — اضغط «تحدث مع الدعم» وسيصلك الرد في نفس المحادثة.",
      );

    case "greeting":
      return build(
        `أهلاً ${ctx.userName ? ctx.userName.split(" ")[0] : "بك"}! أستطيع متابعة طلباتك، حل مشاكل الحسابات والألعاب، والبحث عن الأسعار.`,
        {
          suggestions: ["حالة طلبي", "الحساب لا يعمل", "أبحث عن لعبة"],
          reason: "greeting",
        },
      );

    case "thanks":
      return build("على الرحب 🌟 إذا احتجت أي شيء آخر أنا هنا.", {
        suggestions: ["حالة طلبي", "تحدث مع الدعم"],
        reason: "thanks",
      });

    case "tried_already": {
      const nextMemory = { failedAttempts: memory.failedAttempts + 1 };
      if (memory.failedAttempts + 1 >= 2) {
        return build(
          "واضح أن المشكلة تحتاج تدخلاً مباشراً — سأحوّلك للأدمن مع ملخص ما جرّبناه حتى الآن.",
          {
            escalate: true,
            suggestions: ["تحدث مع الدعم"],
            reason: "repeated_failure",
            memory: nextMemory,
          },
        );
      }
      const { article } = pickArticle(input, detection, ctx.articles, memory);
      if (article) {
        return build(
          [
            `${article.title} — خطوة بديلة:`,
            ...article.steps.map((step, i) => `${i + 1}. ${step}`),
          ].join("\n"),
          {
            articleId: article.id,
            suggestions: ["ما زالت المشكلة", "تحدث مع الدعم"],
            reason: "alternate_article",
            memory: nextMemory,
          },
        );
      }
      return build(
        "أخبرني بالضبط ما ظهر لك على الشاشة (نص الرسالة أو رمز الخطأ) وسأعطيك الخطوة التالية.",
        {
          suggestions: ["أرسل صورة الشاشة", "تحدث مع الدعم"],
          reason: "need_more_signal",
          memory: nextMemory,
        },
      );
    }

    case "order_status":
    case "order_where":
    case "payment_receipt":
    case "delivery_address": {
      if (!ctx.orders.length && !ctx.activeOrder) {
        return build("لا أرى طلبات على حسابك بعد. بعد إتمام أول طلب ستظهر حالته هنا لحظة بلحظة.", {
          suggestions: ["كيف أشتري؟", "أبحث عن لعبة"],
          reason: "no_orders",
        });
      }
      // Several similar orders and no explicit reference → ask, do not guess.
      if (!ctx.activeOrder && !detection.orderCode && ctx.orders.length > 1) {
        return build(
          `عندك ${ctx.orders.length} طلبات. أي طلب تقصد؟\n${ctx.orders
            .slice(0, 4)
            .map((order) => `• ${order.code} — ${STATUS_AR[order.status] ?? order.status}`)
            .join("\n")}`,
          {
            suggestions: ctx.orders.slice(0, 3).map((order) => order.code),
            reason: "ambiguous_order",
            asked: "which_order",
          },
        );
      }
      const order = detection.order;
      if (!order)
        return escalate("order_not_resolved", "لم أتعرف على الطلب — سأحوّلك للأدمن لمتابعته.");

      if (detection.intent === "delivery_address" && !order.needsAddress) {
        return build(
          "هذا الطلب رقمي بالكامل ولا يحتاج عنوان توصيل — التسليم يتم داخل هذه المحادثة.",
          {
            cards: [
              { kind: "order", code: order.code, text: order.items.map((i) => i.title).join("، ") },
            ],
            suggestions: ["حالة الطلب", "طرق الدفع"],
            reason: "digital_order_no_address",
          },
        );
      }

      return build(orderLines(order, symbol), {
        cards: [
          { kind: "order", code: order.code, text: order.items.map((i) => i.title).join("، ") },
        ],
        suggestions:
          order.paymentStatus === "unpaid"
            ? ["طرق الدفع", "رفع الوصل"]
            : ["الحساب لا يعمل", "تحدث مع الدعم"],
        reason: "order_status_from_order_data",
      });
    }

    case "payment_how":
      return build(
        "بعد إنشاء الطلب تظهر بطاقة طرق الدفع داخل محادثة الطلب مع تفاصيل كل طريقة. أرسل صورة وصل التحويل في نفس المحادثة، وبعد التأكيد ينتقل الطلب إلى التجهيز.",
        { suggestions: ["حالة طلبي", "رفع الوصل"], reason: "faq_payment" },
      );

    case "account_credentials": {
      const order = detection.order;
      const delivered = order?.items.filter((item) => item.credsSentAt) ?? [];
      if (delivered.length) {
        return build(
          [
            "بيانات حسابك مرسلة داخل هذه المحادثة في رسالة «بيانات الحساب»:",
            ...delivered.map(
              (item) => `• ${item.title} — البريد: ${item.deliveryEmail ?? "داخل الرسالة"}`,
            ),
            "كلمة المرور تُعرض بالضغط على «إظهار» في نفس الرسالة لأسباب أمنية.",
          ].join("\n"),
          {
            suggestions: ["الحساب لا يعمل", "تحدث مع الدعم"],
            reason: "credentials_already_delivered",
          },
        );
      }
      if (order && order.paymentStatus !== "paid") {
        return build(
          `طلبك ${order.code} بانتظار تأكيد الدفع، وبعده يتم تجهيز الحساب وتسليمه هنا مباشرة.`,
          { suggestions: ["طرق الدفع", "حالة طلبي"], reason: "credentials_pending_payment" },
        );
      }
      return build("الطلب قيد التجهيز الآن، وبيانات الحساب تُرسل في هذه المحادثة فور جهوزها.", {
        suggestions: ["حالة طلبي", "تحدث مع الدعم"],
        reason: "credentials_in_preparation",
      });
    }

    case "verification_code":
      return build(
        "لا تُغلق شاشة إدخال الرمز. أرسل هنا رقم الطلب واسم اللعبة وسنجلب رمز التحقق من بريد الحساب ونرسله لك خلال دقائق.",
        {
          suggestions: ["حالة طلبي", "تحدث مع الدعم"],
          reason: "verification_code_flow",
          escalate: true,
        },
      );

    case "account_login_problem":
    case "game_not_opening":
    case "primary_device": {
      const { article, strong } = pickArticle(
        input,
        detection,
        ctx.articles,
        memory,
        hint?.articleId,
      );
      // With a resolved article we answer; guessing only happens when nothing matched.
      if (article && (strong || detection.confidence === "high" || Boolean(hint?.articleId))) {
        return build(
          [`${article.title}:`, ...article.steps.map((step, i) => `${i + 1}. ${step}`)].join("\n"),
          {
            articleId: article.id,
            ...(article.imageUrl
              ? { cards: [{ kind: "image", url: article.imageUrl, text: article.title }] }
              : {}),
            suggestions: ["جربت وما نفع", "تحدث مع الدعم"],
            reason: detection.errorCode ? "article_by_error_code" : "article_strong_match",
          },
        );
      }
      if (article?.ask && !memory.askedQuestions.includes(article.id)) {
        return build(article.ask, {
          suggestions: ["أرسل صورة الشاشة", "تحدث مع الدعم"],
          reason: "clarify_before_answer",
          asked: article.id,
        });
      }
      if (article) {
        return build(
          [`${article.title}:`, ...article.steps.map((step, i) => `${i + 1}. ${step}`)].join("\n"),
          {
            articleId: article.id,
            suggestions: ["جربت وما نفع", "تحدث مع الدعم"],
            reason: "article_best_effort",
          },
        );
      }
      return build(
        "أخبرني ما يظهر بالضبط على الشاشة (نص الرسالة أو رمز الخطأ) أو أرسل صورة، وإن أردت أحوّلك للأدمن فوراً.",
        {
          suggestions: ["أرسل صورة الشاشة", "تحدث مع الدعم"],
          reason: "problem_needs_detail",
          asked: "problem_detail",
        },
      );
    }

    case "refund_cancel":
      return build(
        "يمكن إلغاء الطلب مجاناً قبل تسليم بيانات الحساب أو قبل شحن المنتج. بعد التسليم لا يمكن الاسترجاع، لكن إن لم يعمل الحساب نستبدله أو نعيد المبلغ بعد التحقق.",
        { suggestions: ["حالة طلبي", "تحدث مع الدعم"], reason: "policy_refund" },
      );

    case "warranty":
      return build(
        "كل حساب مغطّى بضمان استمرارية طوال مدة الطلب: إذا فُقد الوصول لسبب من جهتنا نُصلحه أو نستبدله مجاناً — أخبرنا في هذه المحادثة.",
        { suggestions: ["الحساب لا يعمل", "تحدث مع الدعم"], reason: "policy_warranty" },
      );

    case "banana_wallet":
      return build(
        "الموز هو عملة المتجر: تحصل عليه من الشراء والعروض، وتستبدله بخلفيات ومظاهر أو تبيعه وتشتريه في «سوق الموز» بسعر متغيّر حسب العرض والطلب.",
        { suggestions: ["سوق الموز", "حالة طلبي"], reason: "faq_banana" },
      );

    case "price_question":
    case "product_search": {
      const found = detection.products.length
        ? detection.products
        : findProducts(input, ctx.products);
      if (found.length === 1) {
        return build("هذا ما وجدته عندنا:", {
          cards: [productCard(found[0]!, symbol)],
          suggestions: ["أضف إلى السلة", "هل يحتاج عنوان؟"],
          reason: "catalogue_single_match",
        });
      }
      if (found.length > 1) {
        return build("وجدت أكثر من نتيجة — أي واحدة تقصد؟", {
          cards: found.map((product) => productCard(product, symbol)),
          suggestions: found.slice(0, 3).map((product) => product.title),
          reason: "catalogue_multi_match",
          asked: "which_product",
        });
      }
      return build("أخبرني باسم اللعبة أو المنتج وسأعطيك سعره وتفاصيله فوراً.", {
        suggestions: ["أرخص الألعاب", "تصفح الألعاب"],
        reason: "catalogue_no_match",
      });
    }

    default:
      break;
  }

  // Store policies managed by the admin.
  const policy = (ctx.policies ?? []).find((item) => matchAny(surfaces(input), [item.title]));
  if (policy) {
    return build(`${policy.title}\n${policy.body}`, {
      suggestions: ["تحدث مع الدعم"],
      reason: "admin_policy",
    });
  }

  // Last resort: a very short message inside an order thread, or escalate.
  if (detection.terse && detection.order) {
    return build(orderLines(detection.order, symbol), {
      suggestions: ["الحساب لا يعمل", "طرق الدفع", "تحدث مع الدعم"],
      reason: "terse_message_order_fallback",
    });
  }

  return escalate(
    "unknown_intent",
    "لم أفهم طلبك تماماً ولا أريد أن أخمّن. أستطيع مساعدتك في: حالة الطلب، مشاكل الحساب أو اللعبة، الأسعار، أو أحوّلك للأدمن الآن.",
  );
}

/** Suggestion chips shown before the user types anything. */
export function openingSuggestions(ctx: SupportContext): string[] {
  if (ctx.activeOrder) return ["حالة الطلب", "الحساب لا يعمل", "طرق الدفع"];
  if (ctx.orders.length) return ["حالة طلبي", "الحساب لا يعمل", "تحدث مع الدعم"];
  return ["أبحث عن لعبة", "كيف أشتري؟", "طرق الدفع"];
}

export const INTENT_IDS = Object.keys(INTENT_PHRASES);
