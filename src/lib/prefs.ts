/**
 * Display preferences that must be known before the first paint: background
 * pack, language and motion mode.
 *
 * They live in cookies (not just localStorage) so the server can render
 * <html> with the right theme/lang from the very first byte — no flash of the
 * default cream theme for a member who picked a dark pack.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { DEFAULT_THEME, findTheme } from "./themes";

/**
 * `tr` (Turkish) joins the existing set. `ku` stays supported so the Kurdish
 * copy already shipped to members keeps rendering — nothing is removed here.
 */
export type Lang = "ar" | "en" | "ku" | "tr";
export type Motion = "full" | "lite";

export const THEME_COOKIE = "bananto_theme";
export const LANG_COOKIE = "bananto_lang";
export const LANG_MANUAL_COOKIE = "bananto_lang_manual";
export const MOTION_COOKIE = "bananto_motion";

const MAX_AGE = 60 * 60 * 24 * 365;

/** Cookie header on the server, document.cookie in the browser. */
const cookieHeader = createIsomorphicFn()
  .server(() => getRequestHeader("cookie") ?? "")
  .client(() => (typeof document === "undefined" ? "" : document.cookie));

/**
 * Browser languages, used only when no language cookie exists yet. On the
 * server this is the Accept-Language header so the very first server-rendered
 * byte is already in the visitor's language.
 */
const acceptLanguages = createIsomorphicFn()
  .server(() =>
    (getRequestHeader("accept-language") ?? "")
      .split(",")
      .map((part) => (part.split(";")[0] ?? "").trim())
      .filter(Boolean),
  )
  .client(() =>
    typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [navigator.language])],
  );

/** Visitor country from the edge (Cloudflare sets `cf-ipcountry`). */
const requestCountry = createIsomorphicFn()
  .server(() =>
    (
      getRequestHeader("cf-ipcountry") ??
      getRequestHeader("x-country") ??
      getRequestHeader("cf_country") ??
      ""
    ).toUpperCase(),
  )
  .client(() => "");

/** Arabic-speaking markets: these default to Arabic, everyone else to English. */
export const ARABIC_COUNTRIES = new Set([
  "IQ",
  "SA",
  "AE",
  "KW",
  "QA",
  "BH",
  "OM",
  "YE",
  "JO",
  "SY",
  "LB",
  "PS",
  "EG",
  "LY",
  "TN",
  "DZ",
  "MA",
  "MR",
  "SD",
  "SO",
  "DJ",
  "KM",
]);

/** Country dial codes for those same markets, longest-first when matching. */
const ARABIC_DIAL_CODES = [
  "964",
  "966",
  "971",
  "965",
  "974",
  "973",
  "968",
  "967",
  "962",
  "963",
  "961",
  "970",
  "20",
  "218",
  "216",
  "213",
  "212",
  "222",
  "249",
  "252",
  "253",
  "269",
];

/** Turkey gets Turkish, since the storefront ships a Turkish dictionary. */
export function langFromCountry(code: string): Lang | undefined {
  const cc = String(code ?? "").toUpperCase();
  if (!cc) return undefined;
  if (ARABIC_COUNTRIES.has(cc)) return "ar";
  if (cc === "TR") return "tr";
  return "en";
}

/**
 * Language implied by a registered phone number: an Arab dial code means the
 * member reads Arabic, any other country code means English.
 */
export function langFromPhone(phone: string | null | undefined): Lang | undefined {
  const digits = String(phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const normalised = digits.replace(/^0+/, "");
  if (normalised.startsWith("90")) return "tr";
  if (ARABIC_DIAL_CODES.some((code) => normalised.startsWith(code))) return "ar";
  return "en";
}

/** First-visit guess: ar → Arabic, tr → Turkish, en → English, anything else → Arabic. */
export function guessLang(languages: readonly string[]): Lang {
  for (const raw of languages) {
    const base = String(raw ?? "")
      .toLowerCase()
      .split("-")[0];
    if (base === "ar") return "ar";
    if (base === "tr") return "tr";
    if (base === "en") return "en";
    if (base === "ku") return "ku";
  }
  return "ar"; // Fallback to Arabic as requested
}

export function readCookie(name: string, header = cookieHeader()): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // Use SameSite=Lax for preference cookies to ensure they are sent in
  // cross-site navigations from social apps (Messenger/Insta/etc).
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/** Records an explicit language choice separately from automatic detection. */
export function writeManualLanguage(lang: Lang) {
  writeCookie(LANG_COOKIE, lang);
  writeCookie(LANG_MANUAL_COOKIE, "1");
}

export function isLang(value: unknown): value is Lang {
  return value === "ar" || value === "en" || value === "tr";
}

/** Arabic and Kurdish are written right-to-left; English and Turkish are not. */
export function dirOf(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" || lang === "ku" ? "rtl" : "ltr";
}

/** Everything <html> needs, resolved identically on server and client. */
export function readPrefs() {
  const header = cookieHeader();
  const rawLang = readCookie(LANG_COOKIE, header);
  // Priority: an explicit saved choice, then the browser's preference on a
  // first visit, then Arabic. A stored choice is never overridden by the
  // browser afterwards.
  // Priority when nothing was chosen yet: the visitor's country (IP), then the
  // browser's language list. An Arab country gets Arabic, everyone else English.
  const lang: Lang = isLang(rawLang)
    ? rawLang
    : (langFromCountry(requestCountry()) ?? guessLang(acceptLanguages()));
  const pack = findTheme(readCookie(THEME_COOKIE, header) ?? DEFAULT_THEME);
  const motion: Motion = readCookie(MOTION_COOKIE, header) === "lite" ? "lite" : "full";
  return { lang, dir: dirOf(lang), theme: pack.id, dark: pack.dark, motion };
}
