/**
 * Support data-access layer (allow-list).
 *
 * This is the ONLY place that reads storage for the support engine. It projects
 * a deliberately narrow shape: nothing about cost, profit, purchase price,
 * suppliers, API keys, admin accounts or other users can leave this file,
 * because those fields are never copied into the returned object.
 */

import { getStore, listOrders, getMessages, findUserById } from "./db.server";
import { emptyMemory } from "./support/types";
import type {
  SafeOrder,
  SafeOrderItem,
  SafeProduct,
  SupportContext,
  SupportMemory,
} from "./support/types";
import { articlesFromAdmin, articlesFromGuides, BUILTIN_ARTICLES } from "./support/kb";
import type { Order, Product, Thread, User } from "./types";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeItem(item: Order["items"][number]): SafeOrderItem {
  // deliveryPasswordEnc is intentionally NOT copied.
  return {
    id: item.id,
    productId: String(item.productId),
    title: item.title,
    kind: item.kind,
    quantity: item.quantity,
    ...(item.deliveryEmail && item.credsSentAt ? { deliveryEmail: item.deliveryEmail } : {}),
    ...(item.credsSentAt ? { credsSentAt: item.credsSentAt } : {}),
    ...(item.shippedAt ? { shippedAt: item.shippedAt } : {}),
    ...(item.deliveredAt ? { deliveredAt: item.deliveredAt } : {}),
    ...(item.completedAt ? { completedAt: item.completedAt } : {}),
  };
}

function safeOrder(order: Order): SafeOrder {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    currency: order.currency,
    needsAddress: order.needsAddress,
    hasAddress: Boolean(order.address),
    ...(order.address
      ? {
          addressSummary: [order.address.city, order.address.area].filter(Boolean).join(" - "),
        }
      : {}),
    items: order.items.map(safeItem),
    ...(order.threadId ? { threadId: order.threadId } : {}),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function safeProduct(product: Product): SafeProduct {
  // Only public catalogue fields — cost/margin fields are never read.
  return {
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
  };
}

/** Rebuild the conversation memory from the messages already in the thread. */
export async function memoryFromThread(threadId: string): Promise<SupportMemory> {
  const messages = await getMessages(threadId);
  const memory = emptyMemory();
  for (const message of messages) {
    if (message.senderRole !== "assistant") continue;
    const meta = message.body["support"] as
      | { articleId?: string; asked?: string; failedAttempts?: number; memory?: SupportMemory }
      | undefined;
    if (meta?.memory) {
      memory.offeredArticles = meta.memory.offeredArticles ?? memory.offeredArticles;
      memory.askedQuestions = meta.memory.askedQuestions ?? memory.askedQuestions;
      memory.failedAttempts = meta.memory.failedAttempts ?? memory.failedAttempts;
      if (meta.memory.focusOrderCode) memory.focusOrderCode = meta.memory.focusOrderCode;
      if (meta.memory.focusProductId) memory.focusProductId = meta.memory.focusProductId;
    }
  }
  return memory;
}

/**
 * Build the sanitised support context for one user + one thread.
 * `viewHistory` and `pageContext` come from the client and are helper signals
 * only — the engine never uses them as the sole source for identifying a game.
 */
export async function buildSupportContext(input: {
  user: User;
  thread: Thread;
  lang?: SupportContext["lang"];
  pageContext?: {
    path?: string;
    productId?: string;
    productTitle?: string;
    lang?: SupportContext["lang"];
  };
  viewHistory?: { productId: string; title: string }[];
}): Promise<SupportContext> {
  const { user, thread } = input;
  const store = await getStore();
  // Scoped to this user only — never all orders.
  const allOrders = await listOrders();
  const orders = allOrders.filter((order) => order.userId === user.id);
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const profile = (await findUserById(user.id)) ?? user;

  const activeOrder = thread.orderId
    ? orders.find((order) => order.id === thread.orderId)
    : undefined;

  const articles = [
    ...BUILTIN_ARTICLES,
    ...articlesFromAdmin(settings["kbArticles"] as Parameters<typeof articlesFromAdmin>[0]),
    ...articlesFromGuides(
      settings["guides"] as { title?: string; body?: string; imageUrl?: string }[],
    ),
  ];

  const clientLang = input.lang || input.pageContext?.lang;

  return {
    lang: clientLang ?? (profile.settings?.language as SupportContext["lang"]) ?? "ar",
    ...(profile.name ? { userName: profile.name } : {}),
    ...(activeOrder ? { activeOrder: safeOrder(activeOrder) } : {}),
    orders: orders.map(safeOrder),
    products: (store.products ?? [])
      .filter((product) => product.isActive !== false)
      .map(safeProduct),
    articles,
    policies: (settings["policies"] as { title: string; body: string }[]) ?? [],
    memory: await memoryFromThread(thread.id),
    ...(input.pageContext ? { pageContext: input.pageContext } : {}),
    ...(input.viewHistory?.length ? { viewHistory: input.viewHistory.slice(0, 10) } : {}),
  };
}
