/**
 * Fetches a template file and saves it straight to the user's device as a Blob
 * download, instead of letting the browser navigate to the template URL.
 */
export async function downloadTemplateFile(templateFile: string): Promise<void> {
  const url = `/templates/${templateFile}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(
      new Blob([blob], { type: "text/plain;charset=utf-8" }),
    );
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
