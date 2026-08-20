const parseDate = (d) => {
  if (!d) return 0;
  let val = new Date(d).getTime();
  if (!isNaN(val)) return val;
  const match = String(d).match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (match) {
    val = new Date(`${match[3]}-${match[2]}-${match[1]}`).getTime();
    if (!isNaN(val)) return val;
  }
  const yearMatch = String(d).match(/\b(20\d{2}|19\d{2})\b/);
  if (yearMatch) {
    return new Date(`${yearMatch[0]}-01-01`).getTime();
  }
  return 0;
};
console.log(parseDate("25/12/2023"));
console.log(parseDate("10-05-2024"));
console.log(parseDate("2024"));
console.log(parseDate("May 2023"));
console.log(parseDate("TBA"));
