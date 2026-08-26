import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/lib/imageProcessor.ts', 'utf8');

file = file.replace(
  `      const metadata = await image.metadata().catch(() => undefined);
      const buffer = await pipeline.toBuffer();
      const resultBytes = new Uint8Array(buffer);
      return {
        bytes: resultBytes,
        mime: "image/webp",
        width: metadata?.width,
        height: metadata?.height,
        size: resultBytes.length,
      };`,
  `      const metadata = await image.metadata().catch(() => undefined);
      const buffer = await pipeline.toBuffer();
      const resultBytes = new Uint8Array(buffer);
      
      const variants: any = {};
      if (options.generateVariants && metadata && metadata.width) {
        if (metadata.width > 200) {
          variants.thumb = new Uint8Array(await image.clone().resize({ width: 200, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer());
        }
        if (metadata.width > 600) {
          variants.card = new Uint8Array(await image.clone().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 85, effort: 4 }).toBuffer());
        }
        if (metadata.width > 1200) {
          variants.large = new Uint8Array(await image.clone().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 90, effort: 4 }).toBuffer());
        }
      }
      
      return {
        bytes: resultBytes,
        mime: "image/webp",
        width: metadata?.width,
        height: metadata?.height,
        size: resultBytes.length,
        variants
      };`
);

writeFileSync('src/lib/imageProcessor.ts', file);
