const fs = require('fs');
const file = '/app/applet/src/routes/api/upload.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /let targetFolder = "uploads";\s+if \(contentType\.includes\("multipart\/form-data"\)\) \{\s+const formData = await request\.formData\(\);\s+const file = formData\.get\("file"\);\s+const formFolder = formData\.get\("folder"\);\s+if \(typeof formFolder === "string"\) targetFolder = formFolder;\s+if \(!file \|\| !\(file instanceof File\)\) \{\s+return json\(\{ error: "missing_file" \}, \{ status: 400 \}\);\s+\}\s+mime = file\.type \|\| "image\/jpeg";/,
  `let targetFolder = "uploads";
          let productId = "";
          let imageType = "image";
          if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");
            const formFolder = formData.get("folder");
            const formProductId = formData.get("productId");
            const formImageType = formData.get("imageType");
            if (typeof formFolder === "string") targetFolder = formFolder;
            if (typeof formProductId === "string") productId = formProductId.replace(/[^a-zA-Z0-9_-]/g, "");
            if (typeof formImageType === "string") imageType = formImageType.replace(/[^a-zA-Z0-9_-]/g, "");
            if (!file || !(file instanceof File)) {
              return json({ error: "missing_file" }, { status: 400 });
            }
            mime = file.type || "image/jpeg";`
);

content = content.replace(
  /if \(mime\.startsWith\("image\/"\) && mime !== "image\/webp"\) \{\s+const \{ convertToWebP \} = await import\("@\/lib\/imageProcessor"\);\s+const webp = await convertToWebP\(bytes, mime, true\);\s+if \(webp\) \{\s+bytes = webp;\s+mime = "image\/webp";\s+\}\s+\}/,
  `if (mime.startsWith("image/") && mime !== "image/webp") {
            const { convertToWebP } = await import("@/lib/imageProcessor");
            const highQuality = imageType === "3d-texture";
            const webp = await convertToWebP(bytes, mime, highQuality);
            if (webp) {
              bytes = webp;
              mime = "image/webp";
            }
          }`
);

content = content.replace(
  /const root = rootMatch\[1\]!\.toLowerCase\(\);\s+const safeFolder = `\$\{root\}\/\$\{user\.id\}`;\s+\/\/ Generate hash of bytes for deduplication\s+const hashBuffer = await crypto\.subtle\.digest\("SHA-256", new Uint8Array\(bytes\)\);\s+const hashArray = Array\.from\(new Uint8Array\(hashBuffer\)\);\s+const hashHex = hashArray\.map\(b => b\.toString\(16\)\.padStart\(2, '0'\)\)\.join\(''\)\.substring\(0, 16\);\s+const key = `files\/\$\{safeFolder\}\/\$\{hashHex\}\.\$\{ext\}`;/,
  `const root = rootMatch[1]!.toLowerCase();
          
          let safeFolder = \`\${root}/\${user.id}\`;
          if (root === "products" && productId) {
            safeFolder = \`\${root}/\${productId}\`;
          }

          // Generate hash of bytes for deduplication
          const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
          
          let key = \`files/\${safeFolder}/\${hashHex}.\${ext}\`;
          if (root === "products" && productId) {
            key = \`files/\${safeFolder}/\${imageType}-\${hashHex}.\${ext}\`;
          }`
);

fs.writeFileSync(file, content);
console.log("Patched api/upload.ts");
