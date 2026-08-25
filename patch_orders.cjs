const fs = require('fs');
let file = fs.readFileSync('src/routes/api/orders.ts', 'utf8');

// Fix 219: `const id = data.id || null;` -> `const id = data.id || "";`
file = file.replace(/const id = url\.searchParams\.get\("id"\);/g, 'const id = url.searchParams.get("id") || "";');
file = file.replace(/let orderId = url\.searchParams\.get\("orderId"\) \|\| url\.searchParams\.get\("id"\);/g, 'let orderId = url.searchParams.get("orderId") || url.searchParams.get("id") || "";');

// Fix 'order' is possibly 'undefined'. Just add `if (!order) return json({ error: "الطلب غير موجود" }, { status: 404 });` if missing, or use non-null assertions if inside an if(order) block.
file = file.replace(/let order = data\.orderId \? await getOrder\(data\.orderId\) : undefined;/g, 'let order = data.orderId ? await getOrder(data.orderId) : undefined;\nif (!order) return json({ error: "Not found" }, { status: 404 });');

// Actually I'll just use sed to replace `order\.` with `order!.` where appropriate, or maybe let me view the file first.
