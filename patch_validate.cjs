const fs = require('fs');

let code = fs.readFileSync('src/lib/reviews-coupons.functions.ts', 'utf8');

code = code.replace(
  'categoryId: z.string(),',
  'categoryId: z.string(),\n          kind: z.string().optional(),'
);

fs.writeFileSync('src/lib/reviews-coupons.functions.ts', code);
