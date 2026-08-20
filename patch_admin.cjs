const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');

code = code.replace(
  'const errorMsg = result?.error || `HTTP ${res.status}: Failed to save product`;',
  'const errorMsg = result?.error || `HTTP ${res.status}: Failed to save product - ${JSON.stringify(result)}`;\n        toast.error(`Debug: HTTP ${res.status} ${JSON.stringify(result)}`);'
);

code = code.replace(
  'console.error(`[SaveProductError] code=${result?.code} ref=${result?.ref}`, result);',
  'console.error(`[SaveProductError] code=${result?.code} ref=${result?.ref}`, result);\nalert(`[SaveProductError] ${JSON.stringify(result)}`);'
);

fs.writeFileSync('src/components/AdminDashboard.tsx', code);
console.log("Patched AdminDashboard.tsx");
