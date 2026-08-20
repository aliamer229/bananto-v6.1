const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

code = code.replace(
  'className="hidden md:block w-64 shrink-0 space-y-6 sticky top-[100px] z-10 h-fit"',
  'className="hidden md:block w-64 shrink-0 space-y-6 sticky top-24 z-10 self-start max-h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar pb-2"'
);

fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
