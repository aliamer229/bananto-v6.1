const fs = require('fs');
let file = fs.readFileSync('src/routes/api/admin/knowledge-base.ts', 'utf8');

file = file.replace(/updatedAt: new Date\(\)\.toISOString\(\),\n            \}  \}\}\);/g, 'updatedAt: new Date().toISOString(),\n        };');
file = file.replace(/    \}  \}\}\);$/, '  }\n});');

fs.writeFileSync('src/routes/api/admin/knowledge-base.ts', file);
