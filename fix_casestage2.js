const fs = require('fs');
let code = fs.readFileSync('src/hub/gamehub/CaseStage.tsx', 'utf8');

// Undo the bad sed
code = code.replace(/<GameCase3D \{\.\.\.caseProps\} \/>\n      <\/div>\n      \)\}\n    >\n      <div/, "");
fs.writeFileSync('src/hub/gamehub/CaseStage.tsx', code);
