import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/i18n/index.ts', 'utf8');

file = file.replace(
  `  const enFallback = resolve(DICTIONARIES["en"], key);`,
  `  const enFallback = DICTIONARIES["en"] ? resolve(DICTIONARIES["en"], key) : undefined;`
);

writeFileSync('src/lib/i18n/index.ts', file);
