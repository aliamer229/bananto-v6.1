import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getTextValue = (item: unknown): string => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    if ("value" in item) {
      return String((item as any).value ?? "");
    }
    if ("name" in item && typeof (item as any).name === "string") {
      return String((item as any).name ?? "");
    }
    if ("title" in item && typeof (item as any).title === "string") {
      return String((item as any).title ?? "");
    }
    if ("label" in item && typeof (item as any).label === "string") {
      return String((item as any).label ?? "");
    }
  }
  return "";
};
