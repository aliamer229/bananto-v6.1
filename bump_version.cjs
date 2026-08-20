const fs = require('fs');
let code = fs.readFileSync('src/lib/d1.server.ts', 'utf-8');

code = code.replace('const RUNTIME_SCHEMA_VERSION = 5;', 'const RUNTIME_SCHEMA_VERSION = 6;');

fs.writeFileSync('src/lib/d1.server.ts', code);
