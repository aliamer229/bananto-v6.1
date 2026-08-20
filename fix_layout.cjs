const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

const oldLayout = `<div className="px-4 py-6 max-w-7xl mx-auto flex flex-col md:flex-row md:items-start gap-8">
          {/* Desktop Sidebar Filter */}
          <div className="hidden md:block w-64 shrink-0 space-y-6 sticky top-24 z-10 self-start max-h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar pb-2">`;

const newLayout = `<div className="px-4 py-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-8 items-start">
          {/* Desktop Sidebar Filter */}
          <div className="hidden md:block space-y-6 sticky top-24 z-10 self-start max-h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar pb-2">`;

code = code.replace(oldLayout, newLayout);
fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
