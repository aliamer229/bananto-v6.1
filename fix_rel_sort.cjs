const fs = require('fs');
let code = fs.readFileSync('src/routes/category.$categoryId.tsx', 'utf-8');

const oldCode = `        case "release_date": {
          const dateA = new Date(a.releaseDate || a.release_date || 0).getTime();
          const dateB = new Date(b.releaseDate || b.release_date || 0).getTime();
          return dateB - dateA;
        }`;

const newCode = `        case "release_date": {
          const getVal = (p: any) => {
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

code = code.replace(oldCode, newCode);
fs.writeFileSync('src/routes/category.$categoryId.tsx', code);
