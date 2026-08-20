const fs = require('fs');
const file = 'src/components/Header.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  `        <div className="px-4 pt-6 pb-4 flex flex-row-reverse items-center gap-2 w-full [&>*]:pointer-events-auto relative">`,
  `        <div className="px-4 pt-6 pb-4 flex flex-row-reverse items-center gap-2 w-full [&>*]:pointer-events-auto relative">`
);

// Wait, with dir="ltr", flex-row-reverse means DOM order:
// Back/Profile, Admin, Search
// Left to right flex means normal DOM order: Profile is left.
// Flex-row-reverse means Profile is right. Which is what we want. 
// So flex-row-reverse and dir="ltr" is already correct?

fs.writeFileSync(file, code);
