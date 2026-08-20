const fs = require('fs');
let code = fs.readFileSync('src/hub/gamehub/Dialogs.tsx', 'utf8');

code = code.replace(
  `            console.log("Adding to cart from dialog", { productId: game.id, kind: isPhysical ? "hardware" : "account" });`,
  ``
);
fs.writeFileSync('src/hub/gamehub/Dialogs.tsx', code);
