/**
 * AI understanding layer (server only).
 *
 * The model is used ONLY to understand the user: which intent, which game,
 * which order, which knowledge-base article, and whether a human is needed.
 * It never writes the answer — every reply is still built from real order and
 * catalogue data by `engine.ts`, so nothing can be invented.
 *
 * If the gateway is unavailable the rule engine keeps working on its own.
 */

import { findProducts } from "./intent";
import { contentTokens, skeleton } from "./normalize";
import type { SupportContext, SupportIntent } from "./types";

/** Google Gemini (direct) — the key is yours, so nothing depends on Lovable credits. */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3.6-flash";

const INTENTS: SupportIntent[] = [
  "greeting",
  "thanks",
  "human_agent",
  "order_status",
  "order_where",
  "payment_how",
  "payment_receipt",
  "delivery_address",
  "account_credentials",
  "account_login_problem",
  "game_not_opening",
  "primary_device",
  "verification_code",
  "refund_cancel",
  "price_question",
  "product_search",
  "banana_wallet",
  "warranty",
  "tried_already",
  "unknown",
];

export interface SupportHint {
  intent?: SupportIntent;
  productId?: string;
  articleId?: string;
  orderCode?: string;
  errorCode?: string;
  needsHuman?: boolean;
}

/** Catalogue slice the model is allowed to choose from (public fields only). */
function candidateProducts(message: string, ctx: SupportContext) {
  const found = findProducts(message, ctx.products, 8);
  const keys = contentTokens(message)
    .map((token) => skeleton(token))
    .filter((key) => key.length > 1);
  // Widen a little so the model can disambiguate between same-series titles.
  const related = keys.length
    ? ctx.products.filter((product) =>
        [product.title, product.titleEn ?? ""].some((title) =>
          contentTokens(title).some((word) => keys.some((key) => skeleton(word) === key)),
        ),
      )
    : [];
  const pool = [...found, ...related].slice(0, 25);
  const seen = new Set<string>();
  return pool.filter((product) => !seen.has(product.id) && seen.add(product.id));
}

interface GatewayReply {
  choices?: { message?: { content?: string } }[];
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function parseJson(raw: string): Record<string, unknown> | undefined {
  const text = raw.replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Short-lived circuit breaker. When the provider is down (no credits, quota,
 * network) we stop calling it for a while so every chat message stays fast and
 * the deterministic engine simply keeps answering.
 */
let coolDownUntil = 0;
const COOL_DOWN_MS = 60_000;
const TIMEOUT_MS = 12_000;

function trip(reason: string) {
  coolDownUntil = Date.now() + COOL_DOWN_MS;
  console.error(`[support/understand] disabled for 60s: ${reason}`);
}

/** POST with a timeout that never throws out of this module. */
async function post(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    trip(`network: ${String(error)}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Google Gemini direct (own key). */
async function askGemini(key: string, system: string, user: string) {
  const response = await post(
    `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {},
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        thinkingConfig: { thinkingLevel: "low" },
      },
    },
  );
  if (!response) return undefined;
  if (!response.ok) {
    trip(`gemini ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
    return undefined;
  }
  const data = (await response.json().catch(() => null)) as GeminiReply | null;
  return (
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") || undefined
  );
}

/** Try Gemini. Never throws, never blocks a reply. */
async function askModel(system: string, user: string): Promise<string | undefined> {
  if (Date.now() < coolDownUntil) return undefined;
  const gemini = process.env["GEMINI_API_KEY"];
  if (gemini) return askGemini(gemini, system, user);
  return undefined;
}

/**
 * Ask the model to resolve intent + entities. Returns `undefined` when the
 * gateway fails, so the caller falls back to the deterministic rules.
 */
export async function understand(
  message: string,
  ctx: SupportContext,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<SupportHint | undefined> {
  const hasKey = Boolean(process.env["GEMINI_API_KEY"] || process.env["LOVABLE_API_KEY"]);
  if (!hasKey || !message.trim()) return undefined;

  const products = candidateProducts(message, ctx);
  const payload = {
    intents: INTENTS,
    articles: ctx.articles.slice(0, 40).map((article) => ({
      id: article.id,
      title: article.title,
      errorCodes: article.errorCodes ?? [],
    })),
    products: products.map((product) => ({
      id: product.id,
      ar: product.title,
      en: product.titleEn ?? "",
      kind: product.kind,
    })),
    orders: ctx.orders.slice(0, 6).map((order) => ({
      code: order.code,
      status: order.status,
      payment: order.paymentStatus,
      items: order.items.map((item) => item.title),
    })),
    activeOrder: ctx.activeOrder?.code ?? null,
    pageProduct: ctx.pageContext?.productTitle ?? null,
    recentlyViewed: (ctx.viewHistory ?? []).map((item) => item.title).slice(0, 5),
    conversation: history.slice(-8),
    message,
  };

  const system = [
    "أنت طبقة فهم لنظام دعم متجر ألعاب نينتندو عراقي.",
    "مهمتك تحليل رسالة المستخدم فقط وإرجاع JSON، ولا تكتب أي رد للمستخدم.",
    "الرسائل قد تكون بالعربية الفصحى أو اللهجة العراقية أو الكردية أو الإنجليزية أو حروف لاتينية معرّبة، وقد تحتوي أخطاء إملائية.",
    "أسماء الألعاب قد تُكتب بالعربية (زيلدا، ماريو، بريث اوف ذا وايلد) — طابقها مع القائمة المعطاة واختر id واحداً فقط عند الوضوح.",
    "إذا ذكر المستخدم اسم لعبة يطابق عنصراً واحداً منطقياً فاختره ولا تترك الحقل فارغاً.",
    "إذا طلب التحدث مع الأدمن/موظف/إنسان أو عبّر عن غضب أو أن المشكلة لم تُحل، اجعل needsHuman=true.",
    "إذا وصف مشكلة تقنية فاختر intent المناسب و articleId الأقرب من قائمة المقالات.",
    "أرجع JSON فقط بالشكل:",
    '{"intent":"...","productId":null,"articleId":null,"orderCode":null,"errorCode":null,"needsHuman":false}',
  ].join("\n");

  const user = `حلّل هذه البيانات وأرجع json فقط:\n${JSON.stringify(payload)}`;
  const content = await askModel(system, user);
  if (!content) return undefined;
  const parsed = parseJson(content);
  if (!parsed) return undefined;

  const intent = INTENTS.includes(parsed["intent"] as SupportIntent)
    ? (parsed["intent"] as SupportIntent)
    : undefined;
  const productId = typeof parsed["productId"] === "string" ? parsed["productId"] : undefined;
  const articleId = typeof parsed["articleId"] === "string" ? parsed["articleId"] : undefined;
  const orderCode = typeof parsed["orderCode"] === "string" ? parsed["orderCode"] : undefined;
  const errorCode = typeof parsed["errorCode"] === "string" ? parsed["errorCode"] : undefined;

  return {
    ...(intent ? { intent } : {}),
    // Only ids that really exist may pass through.
    ...(productId && ctx.products.some((product) => product.id === productId) ? { productId } : {}),
    ...(articleId && ctx.articles.some((article) => article.id === articleId) ? { articleId } : {}),
    ...(orderCode && ctx.orders.some((order) => order.code === orderCode) ? { orderCode } : {}),
    ...(errorCode ? { errorCode } : {}),
    needsHuman: parsed["needsHuman"] === true,
  };
}
