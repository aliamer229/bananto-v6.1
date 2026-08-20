const fs = require('fs');
let code = fs.readFileSync('src/hub/gamehub/CaseStage.tsx', 'utf8');
code = code.replace(
  `      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-1000",
          modelReady ? "opacity-100" : "opacity-0",
        )}
      >`,
  `      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700",
          modelReady ? "opacity-0" : "opacity-100",
        )}
      >
        <GameCase3D {...caseProps} />
      </div>
      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-1000",
          modelReady ? "opacity-100" : "opacity-0",
        )}
      >`
);
fs.writeFileSync('src/hub/gamehub/CaseStage.tsx', code);
