const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

code = code.replace(
  'p.background,',
  'p.background,\n        p.image,'
);

fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
