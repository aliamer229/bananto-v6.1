const fs = require('fs');
let file = fs.readFileSync('src/lib/support/kb-mining.server.ts', 'utf8');
file = file.replace(/await updateStore\(\{[\s\S]*?\}\);/, 'await updateStore((doc) => ({ ...doc, settings: { ...(doc.settings || {}), kbArticles: currentKb } }));');
fs.writeFileSync('src/lib/support/kb-mining.server.ts', file);
