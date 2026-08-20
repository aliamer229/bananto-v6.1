const fs = require('fs');
let code = fs.readFileSync('src/components/BottomNav.tsx', 'utf8');
code = code.replace(
  `      className="w-full bg-[var(--page)]/90 backdrop-blur-xl border-t border-border px-6 py-3 z-50 flex justify-around sm:justify-center sm:gap-16 lg:gap-24 items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-6 sm:pb-3 shrink-0 transform-gpu"`,
  `      className="w-full bg-[var(--page)]/90 backdrop-blur-xl border-t border-border px-6 py-3 z-50 flex justify-around sm:justify-center sm:gap-16 lg:gap-24 items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom,1.5rem)] sm:pb-3 shrink-0 transform-gpu pointer-events-auto"`
);
fs.writeFileSync('src/components/BottomNav.tsx', code);
