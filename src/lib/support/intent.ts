/**
 * Intent + entity detection with an explicit confidence score.
 *
 * The detector never returns a single blind answer: it returns the best intent
 * plus the runner-ups, so the reply layer can ask one clarifying question
 * instead of guessing.
 */

import { INTENT_PHRASES, HARDWARE_HINTS } from "./lexicon";
import {
  contentTokens,
  distance,
  findErrorCode,
  findOrderCode,
  matchAny,
  norm,
  skeleton,
  surfaces,
  tokens,
} from "./normalize";

import type { Confidence, SafeOrder, SafeProduct, SupportContext, SupportIntent } from "./types";

export interface Detection {
  intent: SupportIntent;
  candidates: SupportIntent[];
  confidence: Confidence;
  errorCode?: string;
  orderCode?: string;
  order?: SafeOrder;
  products: SafeProduct[];
  hardware: boolean;
  /** single-word / very short message */
  terse: boolean;
}

function scoreIntents(input: string): { intent: SupportIntent; score: number }[] {
  const forms = surfaces(input);
  const scored: { intent: SupportIntent; score: number }[] = [];
  for (const [intent, phrases] of Object.entries(INTENT_PHRASES) as [SupportIntent, string[]][]) {
    if (!phrases.length) continue;
    let score = 0;
    for (const phrase of phrases) {
      const hit = matchAny(forms, [phrase]);
      if (hit) score += Math.min(6, Math.max(2, norm(phrase).split(" ").length * 2 + 1));
    }
    if (score > 0) scored.push({ intent, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Fuzzy catalogue lookup over public product fields only.
 *
 * Arabic-written titles are transliterated and compared on a vowel-insensitive
 * consonant skeleton, so "زيلدا بريث" reaches "Breath of the Wild". When one
 * product clearly dominates, only that one is returned — the engine must not
 * ask "which one?" when the answer is obvious.
 */
export function findProducts(input: string, products: SafeProduct[], limit = 3): SafeProduct[] {
  const terms = contentTokens(input);
  const termKeys = terms
    .map((term) => ({ term, key: skeleton(term) }))
    .filter((row) => row.key.length > 1);
  if (!termKeys.length) return [];

  const scored = products
    .map((product) => {
      const titleKeys = [...contentTokens(product.title), ...contentTokens(product.titleEn ?? "")]
        .map((word) => skeleton(word))
        .filter(Boolean);
      const extra = norm(
        [product.genre, product.publisher, (product.tags ?? []).join(" ")]
          .filter(Boolean)
          .join(" "),
      );

      let hits = 0;
      let score = 0;
      for (const { term, key } of termKeys) {
        const exact = titleKeys.includes(key);
        const near =
          !exact &&
          titleKeys.some(
            (titleKey) =>
              Math.abs(titleKey.length - key.length) <= 1 &&
              distance(titleKey, key) <= (key.length >= 4 ? 1 : 0),
          );
        if (exact || near) {
          hits += 1;
          score += (exact ? 6 : 4) + Math.min(4, key.length);
          continue;
        }
        if (extra.includes(term)) score += 1;
      }
      if (!hits) return { product, score: 0, hits: 0 };
      score += Math.round((hits / termKeys.length) * 10);
      if (hits === termKeys.length) score += 6;
      return { product, score, hits };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return [];
  const runnerUp = scored[1];
  if (!runnerUp || best.hits > runnerUp.hits || best.score - runnerUp.score >= 6)
    return [best.product];
  return scored
    .filter((row) => row.hits === best.hits && best.score - row.score <= 5)
    .slice(0, limit)
    .map((row) => row.product);
}

/**
 * Resolve which order the message is about. Explicit code wins, then the thread
 * order, then the conversation focus, then the newest matching order.
 */
function resolveOrder(
  input: string,
  ctx: SupportContext,
  hardware: boolean,
): {
  order?: SafeOrder;
  orderCode?: string;
} {
  const code = findOrderCode(input);
  if (code) {
    const byCode = ctx.orders.find((order) =>
      norm(order.code).includes(norm(code.replace(/^BN-?/i, ""))),
    );
    if (byCode) return { order: byCode, orderCode: byCode.code };
  }
  if (ctx.activeOrder) return { order: ctx.activeOrder, orderCode: ctx.activeOrder.code };

  const focused = ctx.memory.focusOrderCode
    ? ctx.orders.find((order) => order.code === ctx.memory.focusOrderCode)
    : undefined;
  if (focused) return { order: focused, orderCode: focused.code };

  if (hardware) {
    const physical = ctx.orders.find((order) =>
      order.items.some((item) => item.kind === "hardware"),
    );
    if (physical) return { order: physical, orderCode: physical.code };
  }
  const newest = ctx.orders[0];
  return newest ? { order: newest, orderCode: newest.code } : {};
}

export function detect(input: string, ctx: SupportContext): Detection {
  const forms = surfaces(input);
  const scored = scoreIntents(input);
  const hardware = Boolean(matchAny(forms, HARDWARE_HINTS));
  const errorCode = findErrorCode(input);
  const terse = tokens(input).length <= 2;

  // Products can be named in the message, or inherited from the page/history.
  let products = findProducts(input, ctx.products);
  if (!products.length && ctx.pageContext?.productId) {
    const onPage = ctx.products.find((product) => product.id === ctx.pageContext?.productId);
    if (onPage) products = [onPage];
  }
  if (!products.length && ctx.memory.focusProductId) {
    const focused = ctx.products.find((product) => product.id === ctx.memory.focusProductId);
    if (focused) products = [focused];
  }

  const { order, orderCode } = resolveOrder(input, ctx, hardware);

  const top = scored[0];
  const second = scored[1];
  let intent: SupportIntent = top?.intent ?? "unknown";
  let confidence: Confidence = "low";

  if (top) {
    const gap = top.score - (second?.score ?? 0);
    if (top.score >= 5 && gap >= 2) confidence = "high";
    else if (top.score >= 3) confidence = "medium";
    else confidence = "low";
  }

  // An error code is hard evidence of a device problem.
  if (errorCode && intent !== "account_login_problem") {
    intent = "game_not_opening";
    confidence = "high";
  }

  // A message that is only a product name is a catalogue lookup.
  if (intent === "unknown" && products.length) {
    intent = "product_search";
    confidence = products.length === 1 ? "high" : "medium";
  }

  // Single word inside an order thread most often asks about that order.
  if (intent === "unknown" && terse && ctx.activeOrder) {
    intent = "order_status";
    confidence = "medium";
  }

  const candidates = scored.slice(0, 3).map((row) => row.intent);

  return {
    intent,
    candidates,
    confidence,
    ...(errorCode ? { errorCode } : {}),
    ...(orderCode ? { orderCode } : {}),
    ...(order ? { order } : {}),
    products,
    hardware,
    terse,
  };
}
