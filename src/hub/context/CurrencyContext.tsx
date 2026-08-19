import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CurrencyCode, Money, RegionCode } from "@/hub/types";
import { formatAmount, formatMoney } from "@/hub/utils/format";
import { useI18n } from "@/hub/i18n";
import { useCurrency as useSiteCurrency } from "@/context/CurrencyContext";
import { fetchExchangeRates, type ExchangeRates } from "@/hub/services/exchangeService";

/**
 * Display currency + FX.
 *
 * Store prices are always kept in the store's own currency; conversion happens
 * at render time only, and the converted figure is always labelled as
 * approximate next to the authoritative local price.
 */

const STORAGE_KEY = "banam:currency";

export const CURRENCY_BY_REGION: Record<RegionCode, CurrencyCode> = {
  US: "USD",
  JP: "JPY",
  EU: "EUR",
  UK: "GBP",
  HK: "HKD",
  AU: "AUD",
  CA: "CAD",
  BR: "BRL",
  SA: "SAR",
  AE: "AED",
};

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "USD",
  "SAR",
  "AED",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "AUD",
  "CAD",
  "BRL",
];

interface CurrencyValue {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  rates: ExchangeRates | null;
  ratesUpdatedAt: string | null;
  /** Converts between any two supported currencies via the USD base. */
  convert: (amount: number, from: CurrencyCode, to?: CurrencyCode) => number;
  /** Formats in the money's own currency (authoritative store price). */
  formatNative: (money: Money | undefined) => string | null;
  /** Converts into the display currency, then formats. */
  formatConverted: (money: Money | undefined) => string | null;
  formatIn: (amount: number, currency: CurrencyCode) => string;
  isStale: boolean;
}

const CurrencyContext = createContext<CurrencyValue | null>(null);

function readStored(): CurrencyCode {
  if (typeof window === "undefined") return "IQD";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
    if (stored && SUPPORTED_CURRENCIES.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "IQD";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { intlLocale } = useI18n();
  // The hub prices in whatever the shopper picked in the flower menu; IQD is
  // the store's own currency and the default.
  const siteCurrency = useSiteCurrency().currency.toUpperCase();
  const [currency, setCurrencyState] = useState<CurrencyCode>(readStored);

  useEffect(() => {
    if (SUPPORTED_CURRENCIES.includes(siteCurrency as CurrencyCode)) {
      setCurrencyState(siteCurrency as CurrencyCode);
    }
  }, [siteCurrency]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExchangeRates()
      .then((next) => {
        if (!cancelled) setRates(next);
      })
      .catch(() => {
        /* the UI falls back to native prices only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<CurrencyValue>(() => {
    const convert = (amount: number, from: CurrencyCode, to: CurrencyCode = currency) => {
      if (from === to) return amount;
      if (!rates) return amount;
      const fromRate = rates.rates[from];
      const toRate = rates.rates[to];
      if (!fromRate || !toRate) return amount;
      const inUsd = amount / fromRate;
      const converted = inUsd * toRate;
      // Yen-style currencies read wrong with decimals.
      return to === "JPY" ? Math.round(converted) : Math.round(converted * 100) / 100;
    };

    const ageMs = rates ? Date.now() - new Date(rates.updatedAt).getTime() : 0;

    return {
      currency,
      setCurrency,
      rates,
      ratesUpdatedAt: rates?.updatedAt ?? null,
      convert,
      formatNative: (money) => formatMoney(money, intlLocale),
      formatConverted: (money) =>
        money ? formatAmount(convert(money.amount, money.currency), currency, intlLocale) : null,
      formatIn: (amount, code) => formatAmount(amount, code, intlLocale),
      isStale: Boolean(rates) && ageMs > 24 * 3600_000,
    };
  }, [currency, rates, setCurrency, intlLocale]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within <CurrencyProvider>");
  return ctx;
}
