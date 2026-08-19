import { trackBrowsing, getSessionId } from "./activity.functions";

const KEY = "bnt_view_history";
const LIMIT = 12;

export interface ViewedProduct {
  productId: string;
  title: string;
  at: string;
}

export function readViewHistory(): ViewedProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ViewedProduct[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function recordView(productId: string | number, title: string) {
  if (typeof window === "undefined") return;
  const id = String(productId);
  if (!id) return;
  const entry: ViewedProduct = {
    productId: id,
    title: String(title ?? ""),
    at: new Date().toISOString(),
  };
  const next = [entry, ...readViewHistory().filter((item) => item.productId !== id)].slice(
    0,
    LIMIT,
  );
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));

    // Server-side sync
    trackBrowsing({
      data: {
        path: window.location.pathname,
        entityType: "product",
        entityId: id,
        sessionId: getSessionId() || undefined,
        metadata: { title },
      },
    }).catch(() => {});
  } catch {
    /* storage full or blocked — history is optional */
  }
}

export function viewHistoryForSupport() {
  return readViewHistory().map(({ productId, title }) => ({ productId, title }));
}
