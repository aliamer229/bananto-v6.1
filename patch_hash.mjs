import fs from 'fs';
const file = 'src/routes/api/upload.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `          const key = \`files/\${safeFolder}/\${randomId("f")}.\${ext}\`;`;

const replacement = `          // Generate hash of bytes for deduplication
          const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
          const key = \`files/\${safeFolder}/\${hashHex}.\${ext}\`;`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
