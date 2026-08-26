import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getTextValue = (item: unknown): string => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    // If it's an object with a 'value' field (common for tagged inputs/options)
    if ("value" in item) {
      const val = (item as any).value;
      if (typeof val === "string") return val;
      // If it's another nested object with value, recurse, otherwise stringify
      if (val && typeof val === "object" && "value" in val) return getTextValue(val);
      return val == null ? "" : String(val);
    }
    // Other common string-carrying fields
    if ("name" in item && typeof (item as any).name === "string") {
      return (item as any).name;
    }
    if ("title" in item && typeof (item as any).title === "string") {
      return (item as any).title;
    }
    if ("label" in item && typeof (item as any).label === "string") {
      return (item as any).label;
    }
    // Fallback: avoid [object Object]
    return "";
  }
  return item == null ? "" : String(item);
};

export function optimizedImageUrl(url: string | null | undefined, width: number, quality = 85): string {
  if (!url) return "";
  if (url.startsWith("/api/files/")) {
    return `${url}?w=${width}&q=${quality}`;
  }
  if (url.startsWith("/api/img")) {
     // already optimized proxy
     if (!url.includes("w=")) {
        return `${url}&w=${width}&q=${quality}`;
     }
     return url;
  }
  if (url.startsWith("http")) {
    return `/api/img?u=${encodeURIComponent(url)}&w=${width}&q=${quality}&format=webp`;
  }
  return url;
}
