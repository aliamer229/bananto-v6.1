import { rows, slugify, getTextValue } from "@/lib/hub";
import type { FeatureTag } from "@/hub/types";
import { localizedValue } from "./fromProduct";

export function buildFitFor(p: Record<string, unknown>, locale: "ar" | "en") {
  const fit = rows(p["fitFor"])
    .map((r) =>
      getTextValue(r["valueEn"] ?? r["value"] ?? r),

    )
    .filter(Boolean);
  const notFit = rows(p["notFitFor"])
    .map((r) =>
      getTextValue(
        locale === "en" && r["valueEn"] ? r["valueEn"] : r["value"] !== undefined ? r["value"] : r,
      ),
    )
    .filter(Boolean);

  if (!fit.length && !notFit.length) return undefined;

  const tags: Array<{ id: string; label: string; positive: boolean }> = [
    ...fit.map((label) => ({ id: slugify(label), label, positive: true })),
    ...notFit.map((label) => ({ id: slugify(label), label, positive: false })),
  ];
  return tags;
}

export function buildFeatures(
  p: Record<string, unknown>,
  locale: "ar" | "en",
): FeatureTag[] | undefined {
  const list = rows(p["features"]);
  if (!list.length) return undefined;
  const mapped = list
    .map((row) => {
      const label = getTextValue(
        locale === "en" && row["valueEn"]
          ? row["valueEn"]
          : row["value"] !== undefined
            ? row["value"]
            : row,
      );
      if (!label) return null;
      return { id: slugify(label), label };
    })
    .filter((f): f is FeatureTag => Boolean(f));
  return mapped.length ? mapped : undefined;
}
