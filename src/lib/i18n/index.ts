/**
 * Key-based localisation for ar / en / tr.
 *
 * This sits alongside the older `src/i18n.ts` helper (which is keyed by the
 * Arabic source string). Both read the same `bananto_lang` cookie and the same
 * zustand store, so a language switch moves the whole site at once and no
 * existing `tr("عربي")` call site had to change. New code should use `t()` from
 * here: the keys are typed, contextual and survive copy edits.
 *
 * Everything is compiled in — no translation API, no runtime machine
 * translation, no external service is contacted to render the UI.
 */

import { ar, type Dictionary } from "./dictionaries/ar";
import type { PathOf, Translations } from "./types";

export type Locale = "ar" | "en" | "tr";
export type TranslationKey = PathOf<Dictionary>;

export const LOCALES: Locale[] = ["ar", "en", "tr"];
export const DEFAULT_LOCALE: Locale = "ar";

export const LOCALE_META: Record<
  Locale,
  {
    /** Native name, shown in the switcher as speakers of that language write it. */
    label: string;
    short: string;
    dir: "rtl" | "ltr";
    /** Tag for Intl.NumberFormat / DateTimeFormat / PluralRules. */
    intlLocale: string;
    htmlLang: string;
    ogLocale: string;
  }
> = {
  // `-u-nu-latn` keeps prices and measurements in Latin digits, which is what
  // Iraqi storefronts use, while month names stay Arabic.
  ar: {
    label: "العربية",
    short: "AR",
    dir: "rtl",
    intlLocale: "ar-IQ-u-nu-latn",
    htmlLang: "ar",
    ogLocale: "ar_IQ",
  },
  en: {
    label: "English",
    short: "EN",
    dir: "ltr",
    intlLocale: "en-US",
    htmlLang: "en",
    ogLocale: "en_US",
  },
  tr: {
    label: "Türkçe",
    short: "TR",
    dir: "ltr",
    intlLocale: "tr-TR",
    htmlLang: "tr",
    ogLocale: "tr_TR",
  },
};

/**
 * Arabic is the default locale *and* the fallback every other locale resolves
 * through, so it is always present. English and Turkish are fetched on demand —
 * an Arabic shopper (the default for the store's audience) has no reason to
 * download them. Until a locale arrives, `translate()` falls back to Arabic
 * rather than showing a raw dotted key, so a failed fetch degrades instead of
 * breaking; `ensureLanguageAssets()` in src/i18n.ts awaits the load before the
 * first render so that fallback is never actually seen.
 */
const DICTIONARIES: Partial<Record<Locale, Translations<Dictionary>>> = {
  ar: ar as unknown as Translations<Dictionary>,
};

const loaders: Record<Exclude<Locale, "ar">, () => Promise<Translations<Dictionary>>> = {
  en: () => import("./dictionaries/en").then((m) => m.en),
  tr: () => import("./dictionaries/tr").then((m) => m.tr),
};

const inFlight = new Map<Locale, Promise<void>>();

export function loadKeyedDictionary(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE || DICTIONARIES[locale]) return Promise.resolve();
  let pending = inFlight.get(locale);
  if (!pending) {
    pending = loaders[locale as Exclude<Locale, "ar">]()
      .then((dict) => {
        DICTIONARIES[locale] = dict;
      })
      .catch((error) => {
        console.error(`[i18n] failed to load the ${locale} dictionary`, error);
        inFlight.delete(locale);
      });
    inFlight.set(locale, pending);
  }
  return pending;
}

/** True once the locale can be rendered without falling back to Arabic. */
export function isDictionaryLoaded(locale: Locale): boolean {
  return Boolean(DICTIONARIES[locale]);
}

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en" || value === "tr";
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return LOCALE_META[locale].dir;
}

/* --------------------------------- lookup --------------------------------- */

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
  // Supports both {{name}} and {name} so copy can be written either way.
  return template.replace(/\{\{?(\w+)\}?\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

const warned = new Set<string>();

function warnMissing(key: string, locale: Locale) {
  if (!import.meta.env?.DEV) return;
  const namespace = key.split(".")[0] ?? "";
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[i18n] missing translation — key: "${key}", locale: "${locale}", namespace: "${namespace}"`,
  );
}

/**
 * Fallback order: selected language → Arabic → the key itself.
 *
 * In production a missing key never surfaces as a raw dotted path to the
 * shopper: Arabic (the default locale) always has every key by construction,
 * because the other dictionaries are type-checked against it.
 */
export function translate(
  locale: Locale,
  key: TranslationKey | string,
  vars?: Record<string, string | number>,
): string {
  const direct = resolve(DICTIONARIES[locale], key);
  if (direct !== undefined) return interpolate(direct, vars);

  warnMissing(key, locale);

  const fallback = resolve(DICTIONARIES[DEFAULT_LOCALE], key);
  if (fallback !== undefined) return interpolate(fallback, vars);

  return key;
}

/* -------------------------------- plurals --------------------------------- */

const pluralRules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_META[locale].intlLocale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

/**
 * Picks the grammatically correct form for `count` using CLDR plural rules —
 * Arabic's six categories included — instead of gluing a number onto a noun.
 * `plural(locale, "counts.products", 2)` → "منتجان" / "2 products" / "2 ürün".
 */
export function plural(
  locale: Locale,
  baseKey: string,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const category = count === 0 ? "zero" : rulesFor(locale).select(count);
  const withCount = { count, ...vars };

  const candidates = [`${baseKey}_${category}`, `${baseKey}_other`, baseKey];
  for (const candidate of candidates) {
    const value = resolve(DICTIONARIES[locale], candidate);
    if (value !== undefined) return interpolate(value, withCount);
  }
  return translate(locale, `${baseKey}_other`, withCount);
}

/* ------------------------------- formatting -------------------------------- */

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(LOCALE_META[locale].intlLocale, options).format(value);
}

export function formatDate(
  locale: Locale,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    LOCALE_META[locale].intlLocale,
    options ?? { year: "numeric", month: "long", day: "numeric" },
  ).format(date);
}

/* ---------------------------- browser detection ---------------------------- */

/**
 * Only consulted on a visitor's very first request. Once someone picks a
 * language by hand it is stored and never overridden automatically.
 */
export function detectBrowserLocale(languages?: readonly string[]): Locale {
  const list =
    languages ??
    (typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : []);
  for (const raw of list) {
    const base = String(raw ?? "")
      .toLowerCase()
      .split("-")[0];
    if (base === "ar") return "ar";
    if (base === "tr") return "tr";
    if (base === "en") return "en";
  }
  return DEFAULT_LOCALE;
}

export type { Dictionary };
// `en` / `trDict` are deliberately not re-exported: a static re-export would
// pin both dictionaries back onto the critical path, which is what this module
// now goes out of its way to avoid. Use `translate()` / `loadKeyedDictionary()`.
export { ar };
