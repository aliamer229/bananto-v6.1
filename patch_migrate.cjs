const fs = require('fs');
const file = '/app/applet/src/routes/api/admin/migrate-images.ts';
let content = fs.readFileSync(file, 'utf8');

// I'll just rewrite the whole file because it's easier.
const newContent = `import { createFileRoute } from "@tanstack/react-router";
import { json, guard } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getStore, updateStore } from "@/lib/db.server";
import { readBinary, writeBinary, deleteObject } from "@/lib/storage.server";
import { convertToWebP } from "@/lib/imageProcessor";

export const Route = createFileRoute("/api/admin/migrate-images")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          
          let processed = 0;
          let converted = 0;
          let failed = 0;
          let errors: string[] = [];

          // Helper to process a single URL
          const processUrl = async (url: string | null | undefined, productId: string, fieldName: string): Promise<string | null> => {
            if (!url) return null;
            if (url.endsWith(".webp") || url.includes(".webp?")) return url; // Already WebP
            
            try {
              let fileData = null;
              let storageKey = "";
              
              if (url.startsWith("/api/files/")) {
                storageKey = url.replace("/api/files/", "files/");
                fileData = await readBinary(storageKey);
              } else if (url.startsWith("http")) {
                // Handle remote images
                const res = await fetch(url);
                if (!res.ok) throw new Error("Failed to fetch remote image");
                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const mime = res.headers.get("content-type") || "image/jpeg";
                fileData = { bytes, mime };
                const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
                const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
                storageKey = \`files/products/\${productId}/\${fieldName}-\${hashHex}\`;
              }
              
              if (!fileData) return url; // File missing, skip
              
              const isHighQuality = fieldName === "coverHiResImage" || fieldName === "3d-texture";
              const webpBytes = await convertToWebP(fileData.bytes, fileData.mime, isHighQuality);
              if (!webpBytes) return url; // Conversion failed, keep original
              
              // Generate new key
              const newKey = storageKey.replace(/\\.[^/.]+$/, "") + ".webp";
              await writeBinary(newKey, webpBytes, "image/webp", { cacheControl: "public, max-age=31536000" });
              
              // Verify the new key exists
              const verify = await readBinary(newKey);
              if (!verify) {
                throw new Error("Failed to verify newly uploaded WebP");
              }
              
              // Return new URL
              const newUrl = \`/api/files/\${newKey.replace("files/", "")}\`;
              
              // Only delete the old object AFTER verifying the new one, and only if it was in our bucket
              if (url.startsWith("/api/files/")) {
                await deleteObject(storageKey);
              }
              
              return newUrl;
            } catch (err: any) {
              errors.push(\`Failed to migrate \${fieldName} for product \${productId}: \${err.message}\`);
              return url;
            }
          };

          const store = await getStore();
          const products = store.products || [];
          
          for (const product of products) {
            if (processed >= 50) break; // Batch of 50
            
            let updated = false;
            
            const stringFields = [
              "coverImage", "cartridgeImage", "nintendoCardImage", 
              "coverHiResImage", "banner", "bannerImage", "image", 
              "cardArtwork", "mainImage"
            ];
            
            for (const field of stringFields) {
              if (product[field] && typeof product[field] === "string" && !product[field].endsWith(".webp")) {
                const newUrl = await processUrl(product[field], String(product.id || ''), field);
                if (newUrl && newUrl !== product[field]) {
                  product[field] = newUrl;
                  updated = true;
                }
              }
            }

            const arrayFields = [
              "gallery", "screenshots", "hardwareImages", 
              "accessoriesImages", "bannerImages"
            ];
            
            for (const field of arrayFields) {
              if (product[field] && Array.isArray(product[field]) && product[field].length > 0) {
                const newArr = [];
                for (const item of product[field]) {
                  if (typeof item === "string" && !item.endsWith(".webp")) {
                    const newUrl = await processUrl(item, String(product.id || ''), field);
                    if (newUrl && newUrl !== item) {
                      updated = true;
                      newArr.push(newUrl);
                    } else {
                      newArr.push(item);
                    }
                  } else {
                    newArr.push(item);
                  }
                }
                product[field] = newArr;
              }
            }

            if (updated) {
              converted++;
            }
            
            // Only count as processed if it needed migration and we attempted it, 
            // OR we can just check if any image still needs migration.
            // If updated is true, we processed it. 
            // To ensure we move forward, we should only count products that have non-webp images.
            let needsMigration = false;
            for (const f of stringFields) {
              if (product[f] && typeof product[f] === "string" && !product[f].endsWith(".webp")) needsMigration = true;
            }
            for (const f of arrayFields) {
              if (product[f] && Array.isArray(product[f])) {
                for (const item of product[f]) {
                  if (typeof item === "string" && !item.endsWith(".webp")) needsMigration = true;
                }
              }
            }
            
            if (needsMigration || updated) {
              processed++;
            }
          }

          if (converted > 0) {
            await updateStore((current) => {
              current.products = products;
              return current;
            });
          }

          return json({
            success: true,
            processed,
            converted,
            failed: errors.length,
            errors
          });
        }),
    },
  },
});
`;

fs.writeFileSync(file, newContent);
console.log("Replaced migrate-images.ts");
