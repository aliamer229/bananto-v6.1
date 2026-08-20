const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

const regex = /if \(list\.length === 0\) \{[\s\S]*?return \[[\s\S]*?\];[\s\S]*?\}/;
code = code.replace(regex, 'if (list.length === 0) { return []; }');

fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
