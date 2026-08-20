import { useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { DEFAULT_THEME, findTheme } from "@/lib/themes";
import {
  LANG_COOKIE,
  LANG_MANUAL_COOKIE,
  MOTION_COOKIE,
  THEME_COOKIE,
  readCookie,
  writeCookie,
  isLang,
  dirOf,
} from "@/lib/prefs";

/** Applies the pack to <html> — data-theme drives tokens, `dark` drives dark: utilities. */
function apply(id: string) {
  if (typeof document === "undefined") return;
  const pack = findTheme(id);
  const root = document.documentElement;
  root.dataset["theme"] = pack.id;
  root.classList.toggle("dark", pack.dark);
  root.style.colorScheme = pack.dark ? "dark" : "light";
  writeCookie(THEME_COOKIE, pack.id);
}

/**
 * Keeps the whole site on the member's chosen background pack, language and
 * motion mode. Everything is mirrored into cookies so the server renders the
 * right <html> attributes on the next visit — no flash of the default theme.
 */
export default function ThemeApplier() {
  const { user } = useAuth();
  const currentLanguage = useI18n((state) => state.lang);
  const setLang = useI18n((state) => state.setLang);
  const settings = user?.settings as
    { theme?: string; language?: string; liteMotion?: boolean } | undefined;

  // Background pack.
  useEffect(() => {
    apply(settings?.theme || readCookie(THEME_COOKIE) || DEFAULT_THEME);
  }, [settings?.theme]);

  // Language from the profile (falls back to whatever the cookie already had).
  useEffect(() => {
    // A cookie is the most recent browser choice. Do not let a stale profile
    // response undo a language the member just selected in this session.
    const cookieLanguage = readCookie(LANG_COOKIE);
    const language = readCookie(LANG_MANUAL_COOKIE)
      ? cookieLanguage
      : settings?.language || cookieLanguage;
    if (!isLang(language)) return;
    if (language !== currentLanguage) setLang(language);
    document.documentElement.lang = language;
    document.documentElement.dir = dirOf(language);
  }, [settings?.language, currentLanguage, setLang]);

  // Motion mode for low-end devices.
  useEffect(() => {
    const lite = settings?.liteMotion ?? readCookie(MOTION_COOKIE) === "lite";
    document.documentElement.dataset["motion"] = lite ? "lite" : "full";
    writeCookie(MOTION_COOKIE, lite ? "lite" : "full");
  }, [settings?.liteMotion]);

  return null;
}
