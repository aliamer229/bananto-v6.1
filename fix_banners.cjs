const fs = require("fs");
let code = fs.readFileSync("src/routes/category.$categoryId.tsx", "utf-8");

const oldLoop = `      candidates.forEach((img) => {
        if (typeof img === "string" && img.length > 5) {
          bannerSet.add(img);
        }
      });`;

const newLoop = `      candidates.forEach((img) => {
        if (typeof img === "string" && img.length > 5 && !isCartridgeLike(img)) {
          bannerSet.add(img);
        }
      });`;

code = code.replace(oldLoop, newLoop);

const oldList = `    const list = Array.from(bannerSet);

    // High quality fallback game wallpapers if none found`;

const newList = `    let list = Array.from(bannerSet);
    // Shuffle the list
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    // High quality fallback game wallpapers if none found`;

code = code.replace(oldList, newList);
fs.writeFileSync("src/routes/category.$categoryId.tsx", code);
