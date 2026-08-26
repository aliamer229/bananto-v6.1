import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/files/$.ts', 'utf8');

file = file.replace(
  `import { readBinaryStream } from "@/lib/storage.server";`,
  `import { readBinaryStream, readBinary } from "@/lib/storage.server";`
);

file = file.replace(
  `let file: any = await readBinaryStream(\`files/\${path}\`);`,
  `let file: any = targetWidth > 0 ? await readBinary(\`files/\${path}\`) : await readBinaryStream(\`files/\${path}\`);`
);

writeFileSync('src/routes/api/files/$.ts', file);
