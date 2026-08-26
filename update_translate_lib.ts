import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/i18n/index.ts', 'utf8');

file = file.replace(
  `  const fallback = resolve(DICTIONARIES[DEFAULT_LOCALE], key);
  if (fallback !== undefined) return interpolate(fallback, vars);

  return key;`,
  `  const fallback = resolve(DICTIONARIES[DEFAULT_LOCALE], key);
  if (fallback !== undefined) return interpolate(fallback, vars);

  // Fallback to English UI string temporarily
  const enFallback = resolve(DICTIONARIES["en"], key);
  if (enFallback !== undefined) return interpolate(enFallback, vars);

  return key;`
);

writeFileSync('src/lib/i18n/index.ts', file);
