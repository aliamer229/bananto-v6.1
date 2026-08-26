import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

file = file.replace(
  `const ok = await loadFromDb(() => false);`,
  `const fakeController = new AbortController();\n      const ok = await loadFromDb(fakeController.signal);`
);

writeFileSync('src/components/AdminDashboard.tsx', file);
