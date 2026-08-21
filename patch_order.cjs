const fs = require('fs');

let typesCode = fs.readFileSync('src/lib/types.ts', 'utf8');
typesCode = typesCode.replace(
  '  total: number;',
  '  total: number;\n  discountAmount?: number;\n  couponCode?: string;'
);
fs.writeFileSync('src/lib/types.ts', typesCode);

