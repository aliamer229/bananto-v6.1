import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/prefs.ts', 'utf8');

file = file.replace(
  `export function guessLang(languages: readonly string[]): Lang {
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
}`,
  `export function guessLang(languages: readonly string[]): Lang {
  return "ar"; // Arabic is the default as requested
}`
);

file = file.replace(
  `export function langFromCountry(code: string): Lang | undefined {
  const cc = String(code ?? "").toUpperCase();
  if (!cc) return undefined;
  if (ARABIC_COUNTRIES.has(cc)) return "ar";
  if (cc === "TR") return "tr";
  return "en";
}`,
  `export function langFromCountry(code: string): Lang | undefined {
  return undefined; // Do not use country logic to switch to English
}`
);

writeFileSync('src/lib/prefs.ts', file);
