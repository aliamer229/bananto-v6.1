/**
 * Internal acquisition cost is never sent to shoppers. Visibility therefore
 * depends only on customer-facing price and the explicit admin status flags.
 */

export function toAmount(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isProductPriced(product: unknown): boolean {
  const p = (product ?? {}) as Record<string, unknown>;
  const isDigital = [
    "account",
    "offline_account",
    "online_account",
    "preorder",
    "digital_code",
  ].includes(String(p["kind"] || ""));

  // Digital accounts might have 0 cost if supplier model is subscription-based,
  // but they MUST have a price > 0 for customers.
  const hasPrice = toAmount(p["price"]) > 0;

  // If explicitly marked active by admin, show.
  return (
    (hasPrice || p["isActive"] === true) && p["status"] !== "غير نشط" && p["isActive"] !== false
  );
}

/**
 * Hidden by an admin, so no customer-facing surface may render it.
 *
 * Only an explicit `true` hides a product: the field did not exist until the
 * batch importer needed it, and every product saved before that must stay
 * exactly as visible as it was.
 */
export function isProductHidden(product: unknown): boolean {
  const p = (product ?? {}) as Record<string, unknown>;
  return p["isHidden"] === true || p["is_hidden"] === true;
}

/** Visible + buyable in the storefront. */
export function isProductPurchasable(product: unknown): boolean {
  const p = (product ?? {}) as Record<string, unknown>;
  if (isProductHidden(p)) return false;
  if (p["status"] === "غير نشط" || p["isActive"] === false) return false;
  return isProductPriced(p);
}

export function filterPurchasable<T>(products: T[] | undefined): T[] {
  return (products ?? []).filter((p) => isProductPurchasable(p));
}
