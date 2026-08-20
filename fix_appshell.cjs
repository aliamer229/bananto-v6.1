const fs = require('fs');
let code = fs.readFileSync('src/components/AppShell.tsx', 'utf8');

code = code.replace(
  `      {!hideNav && !isTelegramMiniApp && (
        <div id="app-bottom-nav" className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav currentView={currentView} onNavigate={handleNavigate} />
        </div>
      )}`,
  `      {!hideNav && !isTelegramMiniApp && (
        <div id="app-bottom-nav" className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none [&>*]:pointer-events-auto">
          <BottomNav currentView={currentView} onNavigate={handleNavigate} />
        </div>
      )}`
);
fs.writeFileSync('src/components/AppShell.tsx', code);
