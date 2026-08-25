const fs = require('fs');
let file = fs.readFileSync('src/routes/api/admin/knowledge-base.ts', 'utf8');

file = file.replace(/    \}\n  \}\n\}\);/g, '    }),\n  }\n});');

fs.writeFileSync('src/routes/api/admin/knowledge-base.ts', file);
