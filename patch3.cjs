const fs = require('fs');
let code = fs.readFileSync('src/lib/mediaIngest.server.ts', 'utf8');

const logs = `
  console.log(\`RAW_URL_RECEIVED=\${sourceUrl}\`);
  console.log(\`RAW_URL_LENGTH=\${sourceUrl.length}\`);
  console.log(\`RAW_URL_LAST_100_CHARS=\${sourceUrl.slice(-100)}\`);
`;

code = code.replace(
  'export async function ingestRemoteImage(options: RemoteImageIngestOptions): Promise<IngestResult> {',
  'export async function ingestRemoteImage(options: RemoteImageIngestOptions): Promise<IngestResult> {\n' + logs
);

fs.writeFileSync('src/lib/mediaIngest.server.ts', code);
