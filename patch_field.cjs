const fs = require('fs');
const file = '/app/applet/src/components/admin/ImageUploadField.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /interface ImageUploadFieldProps \{/,
  `interface ImageUploadFieldProps {
  productId?: string;
  imageType?: string;`
);

content = content.replace(
  /export function ImageUploadField\(\{/,
  `export function ImageUploadField({
  productId,
  imageType,`
);

content = content.replace(
  /formData\.append\("file", uploadFile\);\s+formData\.append\("folder", folder\);/,
  `formData.append("file", uploadFile);
        formData.append("folder", folder);
        if (productId) formData.append("productId", productId);
        if (imageType) formData.append("imageType", imageType);`
);

fs.writeFileSync(file, content);
console.log("Patched ImageUploadField.tsx");
