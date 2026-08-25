const fs = require('fs');
const file = 'src/components/admin/ImageUploadField.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    // Check file size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error("حجم الصورة كبير جداً (الحد الأقصى 15 ميجابايت)");
      return;
    }

    try {
      setUploading(true);
      const dataUrl = await fileToDataUrl(file);

      // Upload to server storage
      try {
        const res = await adminApi.upload(dataUrl, folder);
        if (res?.url) {
          onChange(res.url);
          toast.success("تم رفع الصورة وتخزينها بنجاح");
        } else {
          toast.error("فشل رفع الصورة: لم يتم إرجاع رابط.");
        }
      } catch (uploadErr: any) {
        console.error("Server upload failed:", uploadErr);
        toast.error("فشل رفع الصورة: " + (uploadErr?.message || "خطأ غير معروف"));
      }`;

const replacement = `    try {
      setUploading(true);
      
      // Client-side smart image conversion to WebP
      // This prevents the backend from handling giant raw files and exhausting memory
      let uploadFile = file;
      if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.type !== 'image/webp') {
        try {
          const img = new Image();
          const objUrl = URL.createObjectURL(file);
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = objUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const quality = folder === "cartridges" || folder === "products" ? 0.95 : 0.85;
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
            if (blob) {
              uploadFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
            }
          }
          URL.revokeObjectURL(objUrl);
        } catch (e) {
          console.error("Client-side conversion failed", e);
        }
      }

      // Upload via multipart/form-data to bypass base64 JSON payload limits
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("folder", folder);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const res = await response.json();
        if (res?.url) {
          onChange(res.url);
          toast.success("تم رفع الصورة وتخزينها بنجاح");
        } else {
          toast.error("فشل رفع الصورة: لم يتم إرجاع رابط.");
        }
      } catch (uploadErr: any) {
        console.error("Server upload failed:", uploadErr);
        toast.error("فشل رفع الصورة: " + (uploadErr?.message || "خطأ غير معروف"));
      }`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
