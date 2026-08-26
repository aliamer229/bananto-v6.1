import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/translate.server.ts', 'utf8');

file = file.replace(
  `title: result.titleAr || product.title || sourceTitle,`,
  `title: sourceTitle, // explicitly keep English title as the main title`
);

writeFileSync('src/lib/translate.server.ts', file);
