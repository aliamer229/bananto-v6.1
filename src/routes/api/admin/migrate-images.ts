import { createFileRoute } from "@tanstack/react-router";
import { json, guard } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { d1Run, d1All } from "@/lib/d1.server";
import { hasObject, writeBinary, readBinary } from "@/lib/storage.server";
import { processImageToWebP } from "@/lib/imageProcessor";

async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/admin/migrate-images")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          
          const { searchParams } = new URL(request.url);
          const limit = parseInt(searchParams.get("limit") || "10");
          
          const rows = await d1All<{ key: string; value: string }>(
            `SELECT key, value FROM store_kv WHERE key LIKE 'store:product:%'`
          );
          
          let converted = 0;
          let totalImages = 0;
          let skipped = 0;
          
          const logs: string[] = [];
          for (const row of rows) {
            if (converted >= limit) break;
            let changed = false;
            
            try {
              const product = JSON.parse(row.value);
              const fields = [
                "image", "mainImage", "coverImage", "cartridgeImage", "nintendoCardImage", 
                "coverHiResImage", "banner", "bannerImage", "cardArtwork",
                "frontCover", "backCover", "spineCover"
              ];
              const arrayFields = ["gallery", "screenshots", "hardwareImages", "accessoriesImages"];
              
              const processUrl = async (url: string | null | undefined): Promise<string | null> => {
                if (!url) return null;
                if (!url.startsWith("/api/files/")) return url;
                if (url.endsWith(".webp")) return url;
                
                totalImages++;
                const key = url.replace("/api/files/", "files/");
                
                try {
                  const fileData = await readBinary(key);
                  if (!fileData) {
                     logs.push(`Missing file: ${key}`);
                     return url;
                  }
                  
                  const convertedResult = await processImageToWebP(fileData.bytes, "image/jpeg", {
                    highQuality: true, preserveDimensions: true
                  });
                  
                  if (convertedResult) {
                    const hash = (await computeSha256(convertedResult.bytes)).substring(0, 16);
                    const newKey = key.replace(/\.[^/.]+$/, "") + "-" + hash + ".webp";
                    await writeBinary(newKey, convertedResult.bytes, "image/webp", {
                      cacheControl: "public, max-age=31536000, immutable",
                    });
                    logs.push(`Converted ${key} -> ${newKey}`);
                    converted++;
                    return `/api/files/${newKey.replace("files/", "")}`;
                  }
                } catch (err) {
                   logs.push(`Failed to convert ${key}: ${err}`);
                }
                skipped++;
                return url;
              };
              for (const f of fields) {
                 if (product[f]) {
                    const newUrl = await processUrl(product[f]);
                    if (newUrl !== product[f]) {
                       product[f] = newUrl;
                       changed = true;
                    }
                 }
              }
              
              for (const af of arrayFields) {
                 if (Array.isArray(product[af])) {
                    for (let i=0; i<product[af].length; i++) {
                       const newUrl = await processUrl(product[af][i]);
                       if (newUrl !== product[af][i]) {
                          product[af][i] = newUrl;
                          changed = true;
                       }
                    }
                 }
              }
              
              if (changed) {
                 await d1Run(
                   `UPDATE store_kv SET value = ?, updated_at = ? WHERE key = ?`,
                   JSON.stringify(product),
                   new Date().toISOString(),
                   row.key
                 );
              }
              
            } catch (err) {
              logs.push(`Failed product ${row.key}: ${err}`);
            }
          }
          
          return json({ 
            success: true, 
            converted, 
            skipped, 
            totalImages,
            logs 
          });
        }),
    },
  },
});
