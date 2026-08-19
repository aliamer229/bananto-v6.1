/**
 * Client adapter for the support engine.
 *
 * The real engine lives in `src/lib/support/` and is pure. On the server it is
 * fed a sanitised context by `support-context.server.ts`. In the browser (the
 * pre-thread assistant on /chat) this adapter maps the public store/order data
 * the page already has into the same shape.
 */

import { supportAnswer as runEngine, openingSuggestions } from "./support/engine";
import { articlesFromGuides, BUILTIN_ARTICLES } from "./support/kb";
import { emptyMemory, type SafeOrder, type SafeProduct, type SupportMemory } from "./support/types";
import type { Order, Product } from "./types";

export type { SupportCard, SupportReply, SupportMemory } from "./support/types";
export { openingSuggestions };

export type SupportContext = {
  products: Product[];
  orders: Order[];
  guides?: { title: string; body: string; imageUrl?: string }[];
  policies?: { title: string; body: string }[];
  currencySymbol?: string;
  userName?: string;
  memory?: SupportMemory;
  pageContext?: { path?: string; productId?: string; productTitle?: string };
  viewHistory?: { productId: string; title: string }[];
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSafeProduct = (product: Product): SafeProduct => ({
  id: String(product.id),
  title: String(product.title ?? product.titleEn ?? ""),
  ...(product.titleEn ? { titleEn: String(product.titleEn) } : {}),
  price: toNumber(product.price),
  kind: (product.kind as SafeProduct["kind"]) ?? "account",
  ...(product.genre ? { genre: String(product.genre) } : {}),
  ...(product.publisher ? { publisher: String(product.publisher) } : {}),
  ...(product.size ? { size: String(product.size) } : {}),
  ...(product.players ? { players: String(product.players) } : {}),
  ...(product.image ? { image: String(product.image) } : {}),
  ...(Array.isArray(product.tags) ? { tags: product.tags.map(String) } : {}),
});

const toSafeOrder = (order: Order): SafeOrder => ({
  id: order.id,
  code: order.code,
  status: order.status,
  paymentStatus: order.paymentStatus,
  total: order.total,
  currency: order.currency,
  needsAddress: order.needsAddress,
  hasAddress: Boolean(order.address),
  items: order.items.map((item) => ({
    id: item.id,
    productId: String(item.productId),
    title: item.title,
    kind: item.kind,
    quantity: item.quantity,
    ...(item.credsSentAt ? { credsSentAt: item.credsSentAt } : {}),
    ...(item.deliveryEmail && item.credsSentAt ? { deliveryEmail: item.deliveryEmail } : {}),
  })),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export function supportAnswer(input: string, ctx: SupportContext) {
  return runEngine(input, {
    lang: "ar",
    ...(ctx.userName ? { userName: ctx.userName } : {}),
    ...(ctx.currencySymbol ? { currencySymbol: ctx.currencySymbol } : {}),
    orders: (ctx.orders ?? []).map(toSafeOrder),
    products: (ctx.products ?? []).map(toSafeProduct),
    articles: [...BUILTIN_ARTICLES, ...articlesFromGuides(ctx.guides)],
    policies: ctx.policies ?? [],
    memory: ctx.memory ?? emptyMemory(),
    ...(ctx.pageContext ? { pageContext: ctx.pageContext } : {}),
    ...(ctx.viewHistory?.length ? { viewHistory: ctx.viewHistory } : {}),
  });
}
