import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ar, en, type Dictionary } from "./dictionaries";
import { useI18n as useAppLanguage } from "@/i18n";

export type Locale = "ar" | "en";

/** Dotted key paths derived from the dictionary, so `t()` typos fail to compile. */
type PathOf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${PathOf<T[K]>}`;
}[keyof T & string];

export type TranslationKey = PathOf<Dictionary>;

const DICTIONARIES: Record<Locale, unknown> = { ar, en };

const LOCALE_META: Record<Locale, { dir: "rtl" | "ltr"; intlLocale: string; ogLocale: string }> = {
  // `-u-nu-latn` keeps prices and sizes in Latin digits, which is what Gulf
  // storefronts use, while dates and relative times stay Arabic.
  ar: { dir: "rtl", intlLocale: "ar-u-nu-latn", ogLocale: "ar_SA" },
  en: { dir: "rtl", intlLocale: "en-US", ogLocale: "en_US" },
};

const STORAGE_KEY = "banam:locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "rtl" | "ltr";
  /** Locale tag for Intl formatters (dates, numbers, currency). */
  intlLocale: string;
  ogLocale: string;
  isRtl: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function resolve(dict: unknown, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // The hub follows the site language chosen in the flower menu; Kurdish has no
  // hub dictionary yet, so it reads the Arabic copy rather than raw keys.
  const appLang = useAppLanguage((state) => state.lang);
  // The hub follows the site language.
  const locale: Locale = appLang === "ar" ? "ar" : "en";

  const value = useMemo<I18nValue>(() => {
    const meta = LOCALE_META[locale];
    const dict = DICTIONARIES[locale];
    return {
      locale,
      setLocale: () => {}, // No-op, it's controlled globally
      dir: meta.dir,
      intlLocale: meta.intlLocale,
      ogLocale: meta.ogLocale,
      isRtl: meta.dir === "rtl",
      t: (key, vars) => {
        // Fall back to English before showing the raw key.
        const raw = resolve(dict, key) ?? resolve(en, key);
        return raw ? interpolate(raw, vars) : key;
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
