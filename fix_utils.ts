import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/utils.ts', 'utf8');

file = file.replace(/\\\$/g, "$").replace(/\\`/g, "`");

writeFileSync('src/lib/utils.ts', file);
