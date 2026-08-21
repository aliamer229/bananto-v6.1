/**
 * Text normalisation for Arabic (incl. Iraqi dialect), English and Kurdish
 * input, plus arabizi (Arabic typed in latin letters).
 *
 * Everything the engine matches on goes through `norm()` first, so a user can
 * write "ماكو حساب", "makoo hsab" or "MAKU HISAB" and still land on the same
 * intent.
 */

const DIACRITICS = /[\u064b-\u0652\u0670\u0640]/g;

/** latin -> arabic transliteration for arabizi input */
const ARABIZI: [RegExp, string][] = [
  [/kh/g, "خ"],
  [/sh/g, "ش"],
  [/ch/g, "ج"],
  [/th/g, "ث"],
  [/gh/g, "غ"],
  [/aa|ee|oo|ou/g, "ا"],
  [/3/g, "ع"],
  [/7/g, "ح"],
  [/9/g, "ق"],
  [/5/g, "خ"],
  [/2/g, "ا"],
];

/** Normalise a string for matching. Keeps words, drops noise. */
export function norm(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[\u0623\u0625\u0622]/g, "ا")
    .replace(/\u0649/g, "ي")
    .replace(/\u0629/g, "ه")
    .replace(/\u0624/g, "و")
    .replace(/\u0626/g, "ي")
    .replace(/\u06a9/g, "ك")
    .replace(/\u06af/g, "غ")
    .replace(/\u06cc/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{L})\1{2,}/gu, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Second pass: convert a latin-only message into arabic letters. */
export function arabize(value: string): string {
  const text = norm(value);
  if (/[\u0600-\u06ff]/.test(text)) return text;
  let out = text;
  for (const [pattern, replacement] of ARABIZI) out = out.replace(pattern, replacement);
  return out
    .replace(/a/g, "ا")
    .replace(/b/g, "ب")
    .replace(/t/g, "ت")
    .replace(/j/g, "ج")
    .replace(/d/g, "د")
    .replace(/r/g, "ر")
    .replace(/z/g, "ز")
    .replace(/s/g, "س")
    .replace(/f/g, "ف")
    .replace(/q/g, "ق")
    .replace(/k/g, "ك")
    .replace(/l/g, "ل")
    .replace(/m/g, "م")
    .replace(/n/g, "ن")
    .replace(/h/g, "ه")
    .replace(/w|v/g, "و")
    .replace(/y|i|e|o|u/g, "ي")
    .replace(/[a-z]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** arabic -> latin transliteration (game titles written in Arabic). */
const LATIN: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "a",
  آ: "a",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "j",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "d",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "g",
  ف: "f",
  ق: "q",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "w",
  ي: "y",
  ى: "a",
  ة: "h",
  ء: "",
  ؤ: "w",
  ئ: "y",
  پ: "p",
  چ: "ch",
  ژ: "j",
  گ: "g",
  ڤ: "v",
};

/** Convert arabic script into latin letters so "زيلدا" can match "Zelda". */
export function latinize(value: string): string {
  const text = norm(value);
  let out = "";
  for (const char of text) out += LATIN[char] ?? char;
  return out.replace(/\s+/g, " ").trim();
}

/** Consonant skeleton: vowel-insensitive key ("zylda"/"zelda" -> "zld"). */
export function skeleton(value: string): string {
  return latinize(value)
    .replace(/[aeiouwy]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Words that carry no entity meaning and must not drive a catalogue match. */
export const STOPWORDS = new Set([
  "لعبه",
  "لعبة",
  "العبه",
  "اللعبه",
  "اللعبة",
  "العاب",
  "الالعاب",
  "حساب",
  "الحساب",
  "سعر",
  "السعر",
  "بكم",
  "كم",
  "عندكم",
  "عندك",
  "متوفر",
  "موجود",
  "ابحث",
  "اريد",
  "اشتري",
  "شراء",
  "الى",
  "على",
  "من",
  "في",
  "هل",
  "او",
  "مع",
  "شنو",
  "شكد",
  "game",
  "games",
  "the",
  "of",
  "for",
  "and",
  "price",
  "how",
  "much",
  "want",
  "buy",
  "account",
  "switch",
  "nintendo",
  "نينتندو",
  "سويتش",
]);

/** Meaningful words only (entity candidates). */
export function contentTokens(value: string): string[] {
  return tokens(value).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Both matching surfaces for one message. */
export function surfaces(input: string): string[] {
  const base = norm(input);
  const latin = arabize(input);
  const romanised = latinize(input);
  const all = [base, latin, romanised].filter(
    (item, index, list) => item && list.indexOf(item) === index,
  );
  return all.length ? all : [base];
}

export function tokens(value: string): string[] {
  return norm(value).split(" ").filter(Boolean);
}

/** Levenshtein distance, capped for speed. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** Fuzzy word containment: tolerates one or two typos in longer words. */
export function fuzzyHas(haystack: string, needle: string): boolean {
  const target = norm(needle);
  if (!target) return false;
  if (haystack.includes(target)) return true;
  if (target.includes(" ")) return false;
  const tolerance = target.length >= 7 ? 2 : target.length >= 5 ? 1 : 0;
  if (!tolerance) return false;
  return haystack
    .split(" ")
    .some(
      (word) =>
        Math.abs(word.length - target.length) <= tolerance && distance(word, target) <= tolerance,
    );
}

/** True when any of the phrases appears (fuzzily) in any surface of the input. */
export function matchAny(inputSurfaces: string[], phrases: string[]): string | undefined {
  for (const phrase of phrases) {
    for (const surface of inputSurfaces) {
      if (fuzzyHas(surface, phrase)) return phrase;
    }
  }
  return undefined;
}

/** Detect the language the answer should be written in. */
export function detectLang(
  input: string,
  fallback: "ar" | "en" | "ku" | "tr" = "ar",
): "ar" | "en" | "ku" | "tr" {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  const arabicChars = (raw.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latinChars = (raw.match(/[a-zA-Z]/g) ?? []).length;

  const turkishSpecific = /[ğüşıöçĞÜŞİÖÇ]/.test(raw);
  const kurdishSpecific =
    /[\u06a9\u06af\u06cc\u06ce\u0695\u06b5\u067e\u0686]/.test(raw) ||
    /\b(ez|tu|em|hûn|dixwazim|bipirse|spas|silav|heye|nîne|chawa|bashi|çawa|erê|na)\b/i.test(raw);

  if (turkishSpecific) return "tr";
  if (kurdishSpecific) return "ku";

  if (arabicChars === 0 && latinChars > 0) {
    if (
      /\b(merhaba|nasılsın|fiyat|fiyatı|sipariş|oyun|odeme|destek|nasil|alabilirim|evet|hayir)\b/i.test(
        raw,
      )
    ) {
      return "tr";
    }
    return "en";
  }

  if (arabicChars > 0) {
    if (kurdishSpecific) return "ku";
    return fallback === "ku" ? "ku" : "ar";
  }

  return fallback;
}

/** Extract a device/store error code such as 2137-8056 or 0x80070057. */
export function findErrorCode(input: string): string | undefined {
  const hex = input.match(/0x[0-9a-f]{4,8}/i);
  if (hex) return hex[0];
  const nintendo = input.match(/\b\d{4}\s?[-–]\s?\d{4}\b/);
  if (nintendo) return nintendo[0].replace(/\s/g, "");
  return undefined;
}

/** Extract an order code such as BN-123456 or a bare 6+ digit reference. */
export function findOrderCode(input: string): string | undefined {
  const coded = input.match(/\b[A-Za-z]{2,4}[-_]?\d{4,}\b/);
  if (coded) return coded[0].toUpperCase().replace(/[_]/g, "-");
  const bare = input.match(/\b\d{5,}\b/);
  return bare ? bare[0] : undefined;
}
