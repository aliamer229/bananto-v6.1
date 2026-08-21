/**
 * Support data-access layer (allow-list).
 *
 * This is the ONLY place that reads storage for the support engine. It projects
 * a deliberately narrow shape: nothing about cost, profit, purchase price,
 * suppliers, API keys, admin accounts or other users can leave this file,
 * because those fields are never copied into the returned object.
 */

import { getStore, listOrdersByUser, getMessages, findUserById } from "./db.server";
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

/**
 * The member's own wallet, reduced to what support may discuss.
 *
 * Read failures are swallowed deliberately: the assistant should degrade to its
 * generic answer rather than fail the whole conversation because one query
 * misbehaved.
 */
async function safeWallet(
  userId: string,
  profile: { walletBalance?: number; bananaBalance?: number },
) {
  try {
    const { d1All } = await import("./d1.server");
    const pending = await d1All<{ amount: number; method: string; created_at: string }>(
      `SELECT amount, method, created_at FROM recharge_requests
       WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 5`,
      userId,
    );
    const recent = await d1All<{ kind: string; amount: number; created_at: string }>(
      `SELECT kind, amount, created_at FROM wallet_transactions
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      userId,
    );
    return {
      balance: Number(profile.walletBalance ?? 0),
      currency: "IQD",
      bananaBalance: Number(profile.bananaBalance ?? 0),
      pendingTopUps: pending.map((row) => ({
        amount: Number(row.amount ?? 0),
        method: String(row.method ?? ""),
        createdAt: String(row.created_at ?? ""),
      })),
      // Deliberately no description: an admin adjustment note is staff-facing.
      recentTransactions: recent.map((row) => ({
        kind: String(row.kind ?? ""),
        amount: Number(row.amount ?? 0),
        createdAt: String(row.created_at ?? ""),
      })),
    };
  } catch {
    return undefined;
  }
}

/** The member's own trade-ins, with staff notes and internal valuations stripped. */
async function safeTrades(userId: string) {
  try {
    const { d1All } = await import("./d1.server");
    const rows = await d1All<{
      id: string;
      game_name: string;
      status: string;
      store_offer_total_iqd: number | null;
      final_iqd: number | null;
      created_at: string;
    }>(
      `SELECT id, game_name, status, store_offer_total_iqd, final_iqd, created_at
       FROM disc_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      userId,
    );
    return rows.map((row) => {
      const offer = row.store_offer_total_iqd ?? row.final_iqd;
      return {
        id: String(row.id),
        gameName: String(row.game_name ?? ""),
        status: String(row.status ?? ""),
        ...(offer ? { offerIqd: Number(offer) } : {}),
        createdAt: String(row.created_at ?? ""),
      };
    });
  } catch {
    return undefined;
  }
}

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
  // Scoped to this user only — never all orders. Resolved through the
  // orders_user_idx index instead of loading the whole table and filtering.
  const orders = await listOrdersByUser(user.id);
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
  const [wallet, trades] = await Promise.all([safeWallet(user.id, profile), safeTrades(user.id)]);

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
    ...(wallet ? { wallet } : {}),
    ...(trades?.length ? { trades } : {}),
    memory: await memoryFromThread(thread.id),
    ...(input.pageContext ? { pageContext: input.pageContext } : {}),
    ...(input.viewHistory?.length ? { viewHistory: input.viewHistory.slice(0, 10) } : {}),
  };
}
