/**
 * Route remote images through the Cloudflare-side mirror (`/api/img`) so they
 * are stored in R2 and served from the edge cache instead of a third-party
 * host. Local paths (`/img/...`, `/api/files/...`, data URLs) pass through.
 */
export function cdnImage(src?: string | null): string {
  if (!src) return "";
  if (!/^https?:\/\//i.test(src)) return src;
  try {
    const url = new URL(src);
    if (typeof window !== "undefined" && url.host === window.location.host) return src;
    return `/api/img?u=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}
