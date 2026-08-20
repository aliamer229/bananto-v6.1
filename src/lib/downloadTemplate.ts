/**
 * Saves an import template straight to the user's device as a Blob download.
 *
 * When a schema is given the template is generated in the browser from that
 * schema, so the downloaded file always matches the fields the parser accepts
 * — a stale static file under /templates can never lag behind again.
 */
import { generateTemplate } from "@/lib/productImport/generator";
import type { ProductSchema } from "@/lib/productImport/types";

export async function downloadTemplateFile(
  templateFile: string,
  schema?: ProductSchema,
): Promise<void> {
  const url = `/templates/${templateFile}`;

  if (schema) {
    const objectUrl = URL.createObjectURL(
      new Blob([generateTemplate(schema)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = templateFile;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(new Blob([blob], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = templateFile;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Last resort: still hand the file to the browser download manager.
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFile;
    link.click();
  }
}
