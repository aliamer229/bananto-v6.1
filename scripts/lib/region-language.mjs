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

/**
 * A title reduced to what two storefronts can be expected to agree on.
 *
 * Hong Kong keeps the Latin name for a great many third-party releases and
 * writes a Chinese one for the rest, so the comparison strips the decoration
 * both sides add — trademark marks, the Chinese book-title brackets, edition
 * words in parentheses — and then demands the whole remainder match. A
 * containment test once wrote one game's data onto another in this codebase;
 * near-misses are reported as no match instead.
 */
export function comparableTitle(text) {
  return String(text ?? "")
    .replace(/[™®©]/g, "")
    .replace(/[《》「」『』【】（）()［］[\]]/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "");
}

/**
 * Loads the Hong Kong index built by `scripts/build-hong-kong-index.mjs`.
 *
 * Reading a few hundred storefront pages is not something an audit should do on
 * every run, and the file is also the place a person can correct a title whose
 * Chinese name no comparison would ever match.
 */
export function hkIndexFrom(json) {
  const byName = new Map();
  for (const row of json?.titles ?? []) {
    if (!row?.languages?.length) continue;
    for (const name of [row.storeName, row.catalogueTitle]) {
      for (const form of [name, ...latinFragments(name)]) {
        const key = comparableTitle(form);
        if (key && !byName.has(key)) byName.set(key, row);
      }
    }
  }
  return byName;
}

/**
 * The Latin name a Chinese title carries in brackets after it.
 *
 * Hong Kong writes several titles as `《英靈神殿大亂鬥》(Brawlhalla)`. Reducing
 * that whole string to one key buries the only part of it an English-titled
 * catalogue could ever match, so the bracketed Latin run is indexed as a name
 * in its own right.
 */
export function latinFragments(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/[（(]\s*([^）)]{2,80})\s*[）)]/g)) {
    const inner = m[1].trim();
    if (/^[\x20-\x7e™®©:'\u2019.,&!?+-]+$/.test(inner) && /[a-zA-Z]{3}/.test(inner)) out.push(inner);
  }
  return out;
}

/** The Hong Kong SKU for a game, or none — never a near-miss. */
export function matchHk(index, candidates) {
  for (const candidate of candidates) {
    const key = comparableTitle(candidate ?? "");
    if (key && index.has(key)) {
      return { row: index.get(key), why: `matched on "${candidate}"` };
    }
  }
  return { row: null, why: "not in Nintendo Hong Kong's published catalogue" };
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

/** What one region's own list says, on its own. */
export const REGION_VERDICTS = {
  ENGLISH: "ENGLISH",
  NO_ENGLISH: "NO_ENGLISH",
  RESEARCH: "NEEDS_RESEARCH",
};

const readable = (langs) =>
  Array.isArray(langs) && langs.some((l) => READABLE.has(String(l)) || String(l).startsWith("en"));

/** One region, answered from that region's list alone. */
export function classifyRegion(languages) {
  if (!Array.isArray(languages)) return REGION_VERDICTS.RESEARCH;
  return readable(languages) ? REGION_VERDICTS.ENGLISH : REGION_VERDICTS.NO_ENGLISH;
}

/**
 * Classifies one game from the two regional lists, which are kept apart.
 *
 * Each region is answered on its own first, and the combined verdict is derived
 * from the pair — so a game whose Japanese SKU is settled still reports that,
 * instead of the fact of an unknown Hong Kong SKU erasing it. `null` means the
 * region was not established: never an assumption that the other region's list
 * applies here.
 */
export function classify({ jpLanguages, hkLanguages }) {
  const japan = classifyRegion(jpLanguages);
  const hongKong = classifyRegion(hkLanguages);
  const R = REGION_VERDICTS;

  let verdict;
  let why;
  if (japan === R.RESEARCH && hongKong === R.RESEARCH) {
    verdict = VERDICTS.RESEARCH;
    why = "neither region established";
  } else if (japan === R.ENGLISH && hongKong === R.ENGLISH) {
    verdict = VERDICTS.UNLOCKED;
    why = "English on both regional SKUs";
  } else if (japan === R.NO_ENGLISH && hongKong === R.NO_ENGLISH) {
    verdict = VERDICTS.LOCKED;
    why = "neither regional SKU carries English";
  } else if (japan !== R.RESEARCH && hongKong !== R.RESEARCH) {
    verdict = VERDICTS.VARIANT;
    why =
      japan === R.ENGLISH
        ? "English on the Japanese SKU only — a Hong Kong account will not read it"
        : "English on the Hong Kong SKU only — a Japanese account will not read it";
  } else {
    const known = japan === R.RESEARCH ? "Hong Kong" : "Japan";
    const missing = japan === R.RESEARCH ? "Japan" : "Hong Kong";
    const settled = japan === R.RESEARCH ? hongKong : japan;
    verdict = VERDICTS.RESEARCH;
    why = `${known} ${settled === R.ENGLISH ? "carries" : "does not carry"} English; ${missing} not established`;
  }
  return { verdict, why, japan, hongKong };
}

/** What the customer is told, in the store's own Arabic. */
export const ARABIC_WARNING = {
  [VERDICTS.UNLOCKED]: "",
  [VERDICTS.LOCKED]: "هذه اللعبة لا تدعم اللغة الإنجليزية على حسابات اليابان أو هونغ كونغ.",
  [VERDICTS.VARIANT]: "دعم اللغة الإنجليزية يختلف بين حساب اليابان وحساب هونغ كونغ — راجع الوصف قبل الشراء.",
  [VERDICTS.RESEARCH]: "لم يتم تأكيد دعم اللغة الإنجليزية لهذه النسخة بعد.",
};

/**
 * The notice for one account region, since that is what a customer buys.
 *
 * A settled Japanese answer is worth telling someone even while Hong Kong is
 * still open, and the reverse; one notice covering both would have to hedge on
 * the half that is known.
 */
export const ARABIC_REGION_NOTICE = {
  japan: {
    [REGION_VERDICTS.ENGLISH]: "حساب اليابان: اللعبة تدعم اللغة الإنجليزية.",
    [REGION_VERDICTS.NO_ENGLISH]: "حساب اليابان: اللعبة لا تدعم اللغة الإنجليزية.",
    [REGION_VERDICTS.RESEARCH]: "حساب اليابان: دعم اللغة الإنجليزية غير مؤكد بعد.",
  },
  hongKong: {
    [REGION_VERDICTS.ENGLISH]: "حساب هونغ كونغ: اللعبة تدعم اللغة الإنجليزية.",
    [REGION_VERDICTS.NO_ENGLISH]: "حساب هونغ كونغ: اللعبة لا تدعم اللغة الإنجليزية.",
    [REGION_VERDICTS.RESEARCH]: "حساب هونغ كونغ: دعم اللغة الإنجليزية غير مؤكد بعد.",
  },
};
