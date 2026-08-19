import type { CurrencyCode } from "@/hub/types";

/**
 * FX rates, USD-based.
 *
 * When `VITE_FX_ENDPOINT` is configured the rates come from that endpoint and
 * carry its timestamp. Otherwise a bundled snapshot is used — it is explicitly
 * dated so the UI can mark converted prices as approximate and stale rather
 * than presenting them as live.
 *
 * Expected endpoint shape: `{ base: "USD", rates: { EUR: 0.92, ... }, updatedAt: ISO }`
 */

export interface ExchangeRates {
  base: "USD";
  rates: Partial<Record<CurrencyCode, number>>;
  updatedAt: string;
  /** False when the bundled snapshot was used. */
  live: boolean;
}

const SNAPSHOT: ExchangeRates = {
  base: "USD",
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 152,
    HKD: 7.82,
    AUD: 1.52,
    CAD: 1.36,
    BRL: 5.4,
    SAR: 3.75,
    AED: 3.67,
    IQD: 1310,
  },
  // Snapshot capture date — update alongside the values above.
  updatedAt: "2026-01-15T00:00:00.000Z",
  live: false,
};

const CACHE_KEY = "banam:fx-cache";
const CACHE_TTL_MS = 6 * 3600_000;

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const cached = readCache();
  if (cached) return cached;

  const endpoint = import.meta.env["VITE_FX_ENDPOINT"] as string | undefined;
  if (!endpoint) return SNAPSHOT;

  try {
    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`FX endpoint returned ${response.status}`);
    const payload = (await response.json()) as Partial<ExchangeRates>;
    if (!payload?.rates || typeof payload.rates !== "object")
      throw new Error("Malformed FX payload");

    const result: ExchangeRates = {
      base: "USD",
      rates: { USD: 1, ...payload.rates },
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      live: true,
    };
    writeCache(result);
    return result;
  } catch {
    return SNAPSHOT;
  }
}

function readCache(): ExchangeRates | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: ExchangeRates };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: ExchangeRates): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
}
