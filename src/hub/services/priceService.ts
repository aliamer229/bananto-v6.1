import type { PriceHistory, StoreOffer } from "@/hub/types";

/**
 * Price feed access.
 *
 * The hub never mutates timestamps it did not receive. When no live endpoint is
 * configured, seeded offers are returned exactly as stored — including their
 * original `updatedAt` — so the freshness label reflects reality instead of
 * implying a refresh that never happened.
 *
 * Expected endpoint shapes:
 *   GET {VITE_PRICE_ENDPOINT}/offers?slug=…   -> { offers: StoreOffer[] }
 *   GET {VITE_PRICE_ENDPOINT}/history?slug=…  -> { history: PriceHistory[] }
 */

const ENDPOINT = import.meta.env["VITE_PRICE_ENDPOINT"] as string | undefined;

export const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export interface OfferFeedResult {
  offers: StoreOffer[];
  /** True when the data came from the live endpoint rather than the seed. */
  live: boolean;
}

export async function fetchOffers(
  slug: string,
  fallback: StoreOffer[] = [],
): Promise<OfferFeedResult> {
  if (!ENDPOINT) return { offers: fallback, live: false };

  try {
    const response = await fetch(`${ENDPOINT}/offers?slug=${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Price endpoint returned ${response.status}`);
    const payload = (await response.json()) as { offers?: StoreOffer[] };
    if (!Array.isArray(payload.offers)) throw new Error("Malformed offers payload");
    return { offers: payload.offers, live: true };
  } catch {
    return { offers: fallback, live: false };
  }
}

export async function fetchPriceHistory(
  slug: string,
  fallback: PriceHistory[] = [],
): Promise<PriceHistory[]> {
  if (!ENDPOINT) return fallback;

  try {
    const response = await fetch(`${ENDPOINT}/history?slug=${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`History endpoint returned ${response.status}`);
    const payload = (await response.json()) as { history?: PriceHistory[] };
    return Array.isArray(payload.history) ? payload.history : fallback;
  } catch {
    return fallback;
  }
}

export function isLivePricingConfigured(): boolean {
  return Boolean(ENDPOINT);
}
