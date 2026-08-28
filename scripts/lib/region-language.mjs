/**
 * What language a game is actually in, on the account the customer will get.
 *
 * The accounts sold here are Japanese and Hong Kong ones, and a game's language
 * is a property of the regional SKU rather than of the game. Persona 4 Golden
 * is the case that makes it concrete: the Western release is English, and the
 * Japanese eShop SKU of the same game is not. Selling a Japanese account to a
 * customer who expects English is the mistake this module exists to prevent.
 *
 * Region does NOT decide artwork — a US sleeve is the same box as a Japanese
 * one. It decides only what the customer will be able to read.
 *
 * Two sources, each authoritative for its own region and neither substituted
 * for the other:
 *
 *   Japan       `search.nintendo.jp` — Nintendo's own JP catalogue search. It
 *               answers `lang` as an array of ISO codes for the Japanese SKU,
 *               keyed by `icode` (the five characters at the end of the product
 *               code) and `hard` (`1_HAC` = Switch 1, `05_BEE` = Switch 2).
 *
 *   Hong Kong   `nintendo.com.hk/data/json/switch_software.json` lists what
 *               Nintendo distributes in Hong Kong with its HK nsuid, and
 *               `ec.nintendo.com/HK/zh/titles/<nsuid>` renders that SKU's
 *               `languages[].isoCode` server-side.
 *
 * The two lists are never merged. A game can be Chinese-and-English in Hong
 * Kong and Japanese-only in Japan, and reporting either as "the" language would
 * be the error.
 */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const JP_SEARCH = "https://search.nintendo.jp/nintendo_soft/search.json";
const HK_CATALOGUE = "https://www.nintendo.com.hk/data/json/switch_software.json";
const HK_TITLE = (nsuid) => `https://ec.nintendo.com/HK/zh/titles/${nsuid}`;

async function getText(url, { timeout = 30_000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json,text/html,*/*" },
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, text: "" };
    return { ok: true, status: res.status, text: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------- Japan */

/** `HACPAAAAA` → `AAAAA`. The five characters Nintendo keys its catalogue by. */
export function iCode(productCode) {
  const clean = String(productCode ?? "").trim().toUpperCase();
  const m = clean.match(/([A-Z0-9]{5})$/);
  return m ? m[1] : "";
}

/** `1_HAC` → switch1, `05_BEE` → switch2. Anything else is not a Switch SKU. */
export function platformOfHard(hard) {
  const text = String(hard ?? "").toUpperCase();
  if (text.endsWith("BEE")) return "switch2";
  if (text.endsWith("HAC")) return "switch1";
  return null;
}

/** Add-on content, which carries no language list of its own. */
const isDlc = (sform) => /DLC/i.test(String(sform ?? ""));

/**
 * The Japanese catalogue rows for a batch of product codes.
 *
 * One request covers many codes — `icode_s:(A OR B OR C)` — because 148 games
 * is 148 round trips otherwise. The rows come back unfiltered; picking which
 * one is *this* game is {@link matchJp}'s job, and it refuses rather than
 * guesses.
 */
export async function fetchJpRows(codes, { limit = 200 } = {}) {
  const wanted = [...new Set(codes.map((c) => String(c).toUpperCase()).filter(Boolean))];
  if (!wanted.length) return [];
  const fq = encodeURIComponent(`icode_s:(${wanted.join(" OR ")})`);
  const res = await getText(`${JP_SEARCH}?limit=${limit}&fq=${fq}`);
  if (!res.ok) return [];
  try {
    const items = JSON.parse(res.text)?.result?.items ?? [];
    return items.map((i) => ({
      icode: String(i.icode ?? "").toUpperCase(),
      title: String(i.title ?? ""),
      platform: platformOfHard(i.hard),
      hard: String(i.hard ?? ""),
      sform: String(i.sform ?? ""),
      nsuid: String(i.nsuid ?? ""),
      maker: String(i.maker ?? ""),
      releaseDate: String(i.sdate ?? ""),
      status: String(i.ssitu ?? ""),
      languages: Array.isArray(i.lang) ? i.lang.map(String) : null,
    }));
  } catch {
    return [];
  }
}

const YEAR = /(\d{4})/;
const yearOf = (text) => Number(String(text ?? "").match(YEAR)?.[1] ?? 0) || null;

/**
 * Which of the Japanese rows is this game, or none.
 *
 * `icode` is not unique — Breath of the Wild and Mario Kart World both answer
 * to `AAAAA` — so the platform narrows it and, when more than one survives, the
 * release year decides. Two candidates the year cannot separate are reported as
 * ambiguous and left unmatched: a wrong language list is worse than none.
 */
export function matchJp(rows, { code, platform, releaseDate }) {
  const want = String(code ?? "").toUpperCase();
  const candidates = rows.filter(
    (r) =>
      r.icode === want &&
      r.platform === platform &&
      !isDlc(r.sform) &&
      Array.isArray(r.languages) &&
      r.languages.length > 0,
  );
  if (!candidates.length) return { row: null, reason: "no Japanese SKU under this code", candidates: [] };
  if (candidates.length === 1) return { row: candidates[0], reason: "single match", candidates };

  const year = yearOf(releaseDate);
  if (year) {
    const sameYear = candidates.filter((r) => yearOf(r.releaseDate) === year);
    if (sameYear.length === 1) return { row: sameYear[0], reason: "release year", candidates };
  }
  return {
    row: null,
    reason: `ambiguous — ${candidates.length} Japanese SKUs share this code and platform`,
    candidates,
  };
}

/* --------------------------------------------------------------- Hong Kong */

/** Titles Nintendo distributes in Hong Kong, with the HK nsuid where it has one. */
export async function fetchHkCatalogue() {
  const res = await getText(HK_CATALOGUE, { timeout: 45_000 });
  if (!res.ok) return [];
  let rows = [];
  try {
    rows = JSON.parse(res.text);
  } catch {
    return [];
  }
  return rows
    .map((r) => {
      const link = String(r?.link ?? "");
      const nsuid = link.match(/store\.nintendo\.com\.hk\/(\d{10,16})/)?.[1] ?? "";
      return {
        title: String(r?.title ?? ""),
        nsuid,
        /** `CN` Chinese-localised, `JP` Japanese SKU, `EN` English. */
        catalogueLang: String(r?.lang ?? ""),
        media: String(r?.media ?? ""),
        releaseDate: String(r?.release_date ?? ""),
        publisher: String(r?.maker_publisher ?? ""),
      };
    })
    .filter((r) => r.nsuid);
}

/**
 * The languages one Hong Kong SKU is actually sold in.
 *
 * The HK storefront renders the title page on the server, so the language list
 * arrives in the HTML rather than behind a script. `formalName` comes back with
 * it, which is what lets a match be checked rather than assumed.
 */
export async function fetchHkTitle(nsuid) {
  const res = await getText(HK_TITLE(nsuid), { timeout: 40_000 });
  if (!res.ok) return { ok: false, status: res.status, nsuid };
  const html = res.text;
  const languages = [...new Set([...html.matchAll(/isoCode\\?":\\?"([a-z]{2})\\?"/g)].map((m) => m[1]))];
  const formalName = html.match(/formalName\\?":\\?"([^"\\]{1,120})/)?.[1] ?? "";
  return { ok: true, status: res.status, nsuid, languages, formalName };
}

/* ---------------------------------------------------------- the verdict */

/** Languages an Arabic-speaking customer in Iraq can actually play in. */
const READABLE = new Set(["en", "en_US", "ar"]);

export const VERDICTS = {
  UNLOCKED: "LANGUAGE_UNLOCKED",
  LOCKED: "LANGUAGE_REGION_LOCKED",
  VARIANT: "LANGUAGE_VARIANT_DEPENDENT",
  RESEARCH: "NEEDS_RESEARCH",
};

const readable = (langs) =>
  Array.isArray(langs) && langs.some((l) => READABLE.has(String(l)) || String(l).startsWith("en"));

/**
 * Classifies one game from the two regional lists, which are kept apart.
 *
 * `null` means the region was not established — that is NEEDS_RESEARCH, never
 * an assumption that the other region's list also applies here.
 */
export function classify({ jpLanguages, hkLanguages }) {
  const haveJp = Array.isArray(jpLanguages);
  const haveHk = Array.isArray(hkLanguages);
  if (!haveJp && !haveHk) return { verdict: VERDICTS.RESEARCH, why: "neither region established" };

  const jpOk = haveJp ? readable(jpLanguages) : null;
  const hkOk = haveHk ? readable(hkLanguages) : null;

  if (jpOk === true && hkOk === true) return { verdict: VERDICTS.UNLOCKED, why: "English on both regional SKUs" };
  if (jpOk === false && hkOk === false) {
    return { verdict: VERDICTS.LOCKED, why: "neither regional SKU carries English" };
  }
  if (jpOk !== null && hkOk !== null && jpOk !== hkOk) {
    return {
      verdict: VERDICTS.VARIANT,
      why: jpOk
        ? "English on the Japanese SKU only — a Hong Kong account will not read it"
        : "English on the Hong Kong SKU only — a Japanese account will not read it",
    };
  }
  /* One region known, the other not: report what is known and what is missing. */
  const known = jpOk === null ? "Hong Kong" : "Japan";
  const missing = jpOk === null ? "Japan" : "Hong Kong";
  const ok = jpOk === null ? hkOk : jpOk;
  return {
    verdict: VERDICTS.RESEARCH,
    why: `${known} ${ok ? "carries" : "does not carry"} English; ${missing} not established`,
  };
}

/** What the customer is told, in the store's own Arabic. */
export const ARABIC_WARNING = {
  [VERDICTS.UNLOCKED]: "",
  [VERDICTS.LOCKED]: "هذه اللعبة لا تدعم اللغة الإنجليزية على حسابات اليابان أو هونغ كونغ.",
  [VERDICTS.VARIANT]: "دعم اللغة الإنجليزية يختلف بين حساب اليابان وحساب هونغ كونغ — راجع الوصف قبل الشراء.",
  [VERDICTS.RESEARCH]: "لم يتم تأكيد دعم اللغة الإنجليزية لهذه النسخة بعد.",
};
