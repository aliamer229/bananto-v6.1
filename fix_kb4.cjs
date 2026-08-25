const fs = require('fs');
let file = fs.readFileSync('src/routes/api/admin/knowledge-base.ts', 'utf8');

file = file.replace(/updatedAt: new Date\(\)\.toISOString\(\),\n            \}\n  \}\n\}\);\n\n        if \(existingIdx/g, 'updatedAt: new Date().toISOString(),\n        };\n\n        if (existingIdx');
file = file.replace(/    \}\),\n    \}\n  \}\n\}\);/g, '    }\n  }\n});');

fs.writeFileSync('src/routes/api/admin/knowledge-base.ts', file);
