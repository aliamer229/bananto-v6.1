import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/i18n.ts', 'utf8');

file = file.replace(
  `function initialLang(): Language {
  if (typeof document === "undefined") return "ar";
  const match = /(?:^|;\\s*)bananto_lang=([^;]+)/.exec(document.cookie);
  const value = match?.[1];
  if (isLang(value)) return value;
  const docLang = document.documentElement.lang;
  return isLang(docLang) ? docLang : "ar";
}`,
  `function initialLang(): Language {
  if (typeof document === "undefined") return "ar";
  const match = /(?:^|;\\s*)bananto_lang_manual=([^;]+)/.exec(document.cookie);
  const manual = match?.[1];
  const langMatch = /(?:^|;\\s*)bananto_lang=([^;]+)/.exec(document.cookie);
  const langValue = langMatch?.[1];
  
  if (manual === "1" && isLang(langValue)) return langValue;
  return "ar"; // Default to Arabic if not manually selected
}`
);
writeFileSync('src/i18n.ts', file);
