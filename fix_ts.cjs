const fs = require("fs");
let code = fs.readFileSync("src/routes/category.$categoryId.tsx", "utf-8");

code = code.replace("const getVal = (p) => {", "const getVal = (p: any) => {");

fs.writeFileSync("src/routes/category.$categoryId.tsx", code);
