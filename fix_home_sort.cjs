const fs = require("fs");
let code = fs.readFileSync("src/components/HomeView.tsx", "utf-8");

const oldSortCode = `                  const yearA = getYear(a.releaseDate || a.release_date || a.releaseYear || a.release_year);
                  const yearB = getYear(b.releaseDate || b.release_date || b.releaseYear || b.release_year);

                  if (yearA !== yearB) {
                    return yearB - yearA;
                  }

                  // If years are same, fall back to full date
                  const dateA = new Date(a.releaseDate || a.release_date || 0).getTime();
                  const dateB = new Date(b.releaseDate || b.release_date || 0).getTime();`;

const newSortCode = `                  const getRel = (p: any) => p.releaseDate || p.release_date || p.metadata?.releaseDate || p.metadata?.release_date || p.releaseYear || p.release_year;
                  const relA = getRel(a);
                  const relB = getRel(b);
                  
                  const yearA = getYear(relA);
                  const yearB = getYear(relB);

                  if (yearA !== yearB) {
                    return yearB - yearA;
                  }

                  // If years are same, fall back to full date
                  const dateA = new Date(relA || 0).getTime();
                  const dateB = new Date(relB || 0).getTime();`;

code = code.replace(oldSortCode, newSortCode);

// Also need to check line 313 (in the filter):
// Boolean(p.releaseDate || p.release_date || p.releaseYear || p.release_year)
const oldFilter = `Boolean(p.releaseDate || p.release_date || p.releaseYear || p.release_year)`;
const newFilter = `Boolean(p.releaseDate || p.release_date || p.metadata?.releaseDate || p.metadata?.release_date || p.releaseYear || p.release_year)`;
code = code.replace(oldFilter, newFilter);

// Also need to check line 356 (in the map):
// const year = getYear(p.releaseDate || p.release_date || p.releaseYear || p.release_year);
const oldMapYear = `const year = getYear(p.releaseDate || p.release_date || p.releaseYear || p.release_year);`;
const newMapYear = `const year = getYear(p.releaseDate || p.release_date || p.metadata?.releaseDate || p.metadata?.release_date || p.releaseYear || p.release_year);`;
code = code.replace(oldMapYear, newMapYear);

fs.writeFileSync("src/components/HomeView.tsx", code);
