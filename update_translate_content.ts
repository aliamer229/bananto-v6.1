import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/translate.server.ts', 'utf8');

file = file.replace(
  `sourceTitle ? translateText(sourceTitle, "ar") : Promise.resolve(""),
    sourceTitle ? translateText(sourceTitle, "ckb") : Promise.resolve(""),`,
  `Promise.resolve(""), // Skip translating titles
    Promise.resolve(""), // Skip translating titles`
);

writeFileSync('src/lib/translate.server.ts', file);
