const fs = require('fs');

let apiCode = fs.readFileSync('src/routes/api/orders.ts', 'utf8');
apiCode = apiCode.replace(
  'const data = await body<{ items?: CheckoutLine[]; address?: Address }>(request);',
  'const data = await body<{ items?: CheckoutLine[]; address?: Address; couponCode?: string }>(request);'
);
apiCode = apiCode.replace(
  'const order = await createOrderForUser(user, data.items ?? [], data.address);',
  'const order = await createOrderForUser(user, data.items ?? [], data.address, data.couponCode);'
);
fs.writeFileSync('src/routes/api/orders.ts', apiCode);

