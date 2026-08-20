const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

const oldFallback = `    // High quality fallback game wallpapers if none found
    if (list.length === 0) {
      return [
        "https://images.unsplash.com/photo-1612287233207-640a455a0044?q=80&w=1600&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1600&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1600&auto=format&fit=crop",
      ];
    }`;

const newFallback = `    // If no valid game images are found, return an empty array to show the gradient fallback
    if (list.length === 0) {
      return [];
    }`;

code = code.replace(oldFallback, newFallback);
fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
