const fs = require('fs');
const file = '/app/applet/src/routes/api/admin/products/save/finalize.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /await d1Run\(`DELETE FROM store_kv WHERE key LIKE \?`, `staged_save:\$\{sessionId\}:%`\);\s+invalidateStoreCache\(\);\s+return json\(\{ success: true, product: productParts \}\);/,
  `await d1Run(\`DELETE FROM store_kv WHERE key LIKE ?\`, \`staged_save:\${sessionId}:%\`);
          
          invalidateStoreCache();
          
          // Read-after-write verification
          const verifyRows = await d1All<{ key: string; value: string }>(
            \`SELECT key, value FROM store_kv WHERE key = ?\`,
            \`store:product:\${productId}\`
          );
          
          if (verifyRows.length === 0) {
            return json({ error: "Failed to verify product save (Read-after-write failed)" }, { status: 500 });
          }

          return json({ success: true, product: JSON.parse(verifyRows[0].value) });`
);

fs.writeFileSync(file, content);
console.log("Patched finalize.ts");
