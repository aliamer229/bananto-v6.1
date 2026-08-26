import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/files/$.ts', 'utf8');

file = file.replace(
  `const file = await readBinaryStream(\`files/\${path}\`);`,
  `const url = new URL(request.url);
          const targetWidth = Math.min(2400, Math.max(0, parseInt(url.searchParams.get("w") || "0", 10)));
          const targetQuality = Math.min(100, Math.max(40, parseInt(url.searchParams.get("q") || "85", 10)));
          
          let file: any = await readBinaryStream(\`files/\${path}\`);`
);

file = file.replace(
  `          if (file.bytes) {
            return new Response(file.bytes as unknown as BodyInit, { headers });
          }
          return new Response("Not found", { status: 404 });`,
  `          if (file.bytes) {
            if (targetWidth > 0 && file.mime.startsWith("image/")) {
              try {
                const sharpModule = await import("sharp");
                const sharp = sharpModule.default || sharpModule;
                if (typeof sharp === "function") {
                  const outBuf = await sharp(file.bytes, { failOnError: false } as any)
                    .rotate()
                    .resize({ width: targetWidth, withoutEnlargement: true })
                    .webp({ quality: targetQuality, effort: 4 })
                    .toBuffer();
                  return new Response(outBuf as unknown as BodyInit, { headers: { ...headers, "content-type": "image/webp" } });
                }
              } catch {}
            }
            return new Response(file.bytes as unknown as BodyInit, { headers });
          }
          return new Response("Not found", { status: 404 });`
);

writeFileSync('src/routes/api/files/$.ts', file);
