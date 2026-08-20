const fs = require("fs");
let code = fs.readFileSync("src/routes/category.$categoryId.tsx", "utf-8");

const oldSort = `        case "newest":
        default: {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        }`;

const newSort = `        case "newest":
        default: {
          const getVal = (p) => {
            let val = 0;
            if (p.releaseDate) val = new Date(p.releaseDate).getTime();
            else if (p.release_date) val = new Date(p.release_date).getTime();
            else if (p.metadata?.releaseDate) val = new Date(p.metadata.releaseDate).getTime();
            else if (p.metadata?.release_date) val = new Date(p.metadata.release_date).getTime();
            
            if (!val || isNaN(val)) {
              val = new Date(p.createdAt || 0).getTime();
            }
            return isNaN(val) ? 0 : val;
          };
          return getVal(b) - getVal(a);
        }`;

code = code.replace(oldSort, newSort);
fs.writeFileSync("src/routes/category.$categoryId.tsx", code);
