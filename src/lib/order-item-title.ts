/**
 * Where a game's name on an order is allowed to come from.
 *
 * ## The rule
 *
 * `order → order_items → product_id → product.title`. Nothing else.
 *
 * Not the conversation's subject, not the last message, not a cached value the
 * front end kept from another screen, and above all not a generic stand-in.
 * The queue used to end a chain of `??` with `"منتج رقمي"`, so an order whose
 * items had not loaded looked like a real product called "digital product" —
 * and an admin preparing that order had no way to tell the difference between
 * a game named that and a lookup that failed.
 *
 * ## What resolution means here
 *
 * An order item stores `product_id` *and* the `title` it was bought under. The
 * stored title is a copy of `product.title` taken at purchase time, so it is
 * the same chain, one step earlier. When a caller can supply the product
 * catalogue the live title wins (a renamed game should read correctly in the
 * delivery tool); otherwise the item's own record stands in. Both are the
 * order's own data.
 *
 * When neither yields a name, that is a failure and it is reported as one:
 * {@link ORDER_ITEM_TITLE_UNAVAILABLE_AR} is a message to a human, never a
 * value to store, compare or send. Callers log `itemId` and `productId` so the
 * failure can be chased down — never the item's credentials.
 */

export interface OrderItemLike {
  id?: string | null;
  productId?: string | number | null;
  title?: string | null;
}

export interface ProductLike {
  id?: string | number | null;
  title?: string | null;
}

/** Shown to staff and customers in place of a name that could not be resolved. */
export const ORDER_ITEM_TITLE_UNAVAILABLE_AR = "تعذر تحميل بيانات المنتج";

export type OrderItemTitle =
  | {
      ok: true;
      title: string;
      /** Which link in the chain answered. */
      source: "product" | "order_item";
      itemId: string | null;
      productId: string | null;
    }
  | {
      ok: false;
      title: null;
      reason: "no_item" | "no_title";
      itemId: string | null;
      productId: string | null;
    };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Index a product list once, for callers resolving many items. */
export function indexProducts(products: readonly ProductLike[] | null | undefined) {
  const byId = new Map<string, string>();
  for (const product of products ?? []) {
    const id = idOf(product?.id);
    const title = text(product?.title);
    if (id && title) byId.set(id, title);
  }
  return byId;
}

/**
 * The name of the game an order item is for.
 *
 * `products` is optional: pass the catalogue (or an index from
 * {@link indexProducts}) on a surface that has one, and the live title wins.
 */
export function resolveOrderItemTitle(
  item: OrderItemLike | null | undefined,
  products?: readonly ProductLike[] | Map<string, string> | null,
): OrderItemTitle {
  if (!item || typeof item !== "object") {
    return { ok: false, title: null, reason: "no_item", itemId: null, productId: null };
  }

  const itemId = idOf(item.id);
  const productId = idOf(item.productId);

  if (productId) {
    const index = products instanceof Map ? products : indexProducts(products);
    const live = index.get(productId);
    if (live) return { ok: true, title: live, source: "product", itemId, productId };
  }

  const stored = text(item.title);
  if (stored) return { ok: true, title: stored, source: "order_item", itemId, productId };

  return { ok: false, title: null, reason: "no_title", itemId, productId };
}

/**
 * The string to put on screen — the name, or the explicit failure notice.
 *
 * Never returns a plausible-looking placeholder: a caller that renders this
 * shows the customer or the admin that something is wrong, which is the point.
 */
export function orderItemTitleText(resolved: OrderItemTitle): string {
  return resolved.ok ? resolved.title : ORDER_ITEM_TITLE_UNAVAILABLE_AR;
}

/** Convenience for the common "resolve then render" pair. */
export function orderItemTitleOf(
  item: OrderItemLike | null | undefined,
  products?: readonly ProductLike[] | Map<string, string> | null,
): string {
  return orderItemTitleText(resolveOrderItemTitle(item, products));
}

/**
 * Every item on an order, resolved.
 *
 * Failures are reported, not filtered out: a delivery tool that quietly drops
 * an item it could not name would have the admin deliver the wrong number of
 * accounts.
 */
export function resolveOrderTitles(
  items: readonly OrderItemLike[] | null | undefined,
  products?: readonly ProductLike[] | Map<string, string> | null,
): OrderItemTitle[] {
  const index = products instanceof Map ? products : indexProducts(products);
  return (items ?? []).map((item) => resolveOrderItemTitle(item, index));
}

/**
 * A one-line summary of what an order is for, for a queue row or a list.
 *
 * An unresolvable item still occupies a slot in the summary, so the count on
 * screen always matches the number of items the admin has to deliver.
 */
export function orderTitleSummary(
  items: readonly OrderItemLike[] | null | undefined,
  products?: readonly ProductLike[] | Map<string, string> | null,
): string {
  const resolved = resolveOrderTitles(items, products);
  if (resolved.length === 0) return ORDER_ITEM_TITLE_UNAVAILABLE_AR;
  return resolved.map(orderItemTitleText).join("، ");
}

/**
 * The ids behind the items that could not be named, for a log line.
 *
 * Only ids — an order item carries the account it was delivered with.
 */
export function unresolvedTitleIds(resolved: readonly OrderItemTitle[]): Array<{
  itemId: string | null;
  productId: string | null;
  reason: string;
}> {
  return resolved
    .filter((entry): entry is Extract<OrderItemTitle, { ok: false }> => !entry.ok)
    .map((entry) => ({ itemId: entry.itemId, productId: entry.productId, reason: entry.reason }));
}
