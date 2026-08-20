const p1 = { releaseDate: "2024", createdAt: "2024-01-01" };
const p2 = { releaseDate: "2024", createdAt: "2024-02-01" };

const getVal = (p) => {
  let val = 0;
  const d = p.releaseDate;
  if (d) {
    val = new Date(d).getTime();
    if (isNaN(val)) {
      const match = String(d).match(/\b(20\d{2}|19\d{2})\b/);
      if (match) val = new Date(match[0]).getTime();
    }
  }
  if (!val || isNaN(val)) {
    val = new Date(p.createdAt || 0).getTime();
  }
  return isNaN(val) ? 0 : val;
};

console.log(getVal(p1));
console.log(getVal(p2));
