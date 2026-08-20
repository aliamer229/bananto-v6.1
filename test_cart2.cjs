const fs = require('fs');
let code = fs.readFileSync('src/store/useCartStore.ts', 'utf8');

code = code.replace(
  `          let newLines;
          if (state.lines.some((l) => lineKey(l) === key)) {
            newLines = state.lines.map((l) =>
              lineKey(l) === key ? { ...l, quantity: l.quantity + quantity } : l,
            );
          } else {
            newLines = [...state.lines, { ...line, quantity }];
          }`,
  `          let newLines;
          if (state.lines.some((l) => lineKey(l) === key)) {
            newLines = state.lines.map((l) =>
              lineKey(l) === key ? { ...l, quantity: l.quantity + quantity } : l,
            );
          } else {
            newLines = [...state.lines, { ...line, quantity }];
          }`
);
fs.writeFileSync('src/store/useCartStore.ts', code);
