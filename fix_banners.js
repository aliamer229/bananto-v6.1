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

const newList = `    const list = Array.from(bannerSet).sort(() => Math.random() - 0.5);

    // High quality fallback game wallpapers if none found`;

code = code.replace(oldList, newList);
fs.writeFileSync("src/routes/category.$categoryId.tsx", code);
