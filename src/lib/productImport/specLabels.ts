/**
 * Resolves a dynamic specification to a label in the active language.
 *
 * The import file stores a stable key (`spec.key=bluetooth_version`), never a
 * display string, so the same product reads "إصدار Bluetooth" / "Bluetooth
 * Version" / "Bluetooth Sürümü" without the admin typing three labels.
 *
 * Resolution order for a spec label:
 *   1. the built-in `specs.*` dictionary, matched on the stable key
 *   2. an explicit `label_ar` / `label_en` / `label_tr` from the import file
 *   3. any other explicit label the admin did provide
 *   4. the free-text `name` exactly as written
 *
 * Step 4 is the deliberate end of the line: an unknown custom spec falls back
 * to the admin's own wording rather than being machine-translated.
 */

import { translate, type Locale } from "../i18n";
import { ar } from "../i18n/dictionaries/ar";

export interface RawSpec {
  key?: string;
  name?: string;
  labelAr?: string;
  labelEn?: string;
  labelTr?: string;
  value?: string;
  unit?: string;
  note?: string;
}

export interface RawSpecGroup {
  key?: string;
  name?: string;
  labelAr?: string;
  labelEn?: string;
  labelTr?: string;
  order?: number;
  specs?: RawSpec[];
}

export interface ResolvedSpec {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}

export interface ResolvedSpecGroup {
  label: string;
  specs: ResolvedSpec[];
}

/** `bluetooth_version` → `bluetoothVersion`, so template keys can stay snake_case. */
export function camelize(key: string): string {
  return key.replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase());
}

function explicitLabel(
  entry: { labelAr?: string; labelEn?: string; labelTr?: string },
  locale: Locale,
) {
  const byLocale = { ar: entry.labelAr, en: entry.labelEn, tr: entry.labelTr };
  return byLocale[locale] || entry.labelAr || entry.labelEn || entry.labelTr;
}

function known(dict: Record<string, unknown>, camelKey: string): boolean {
  return typeof dict[camelKey] === "string";
}

export function specLabel(locale: Locale, spec: RawSpec): string {
  const camel = spec.key ? camelize(spec.key) : "";
  if (camel && known(ar.specs as unknown as Record<string, unknown>, camel)) {
    return translate(locale, `specs.${camel}`);
  }
  return explicitLabel(spec, locale) || spec.name || spec.key || "";
}

export function specGroupLabel(locale: Locale, group: RawSpecGroup): string {
  const camel = group.key ? camelize(group.key) : "";
  if (camel && known(ar.specs.groups as unknown as Record<string, unknown>, camel)) {
    return translate(locale, `specs.groups.${camel}`);
  }
  return explicitLabel(group, locale) || group.name || group.key || "";
}

/** Drops groups and specs with no value so the UI never renders an empty table. */
export function resolveSpecGroups(
  locale: Locale,
  groups: RawSpecGroup[] | undefined,
): ResolvedSpecGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((group) => ({
      label: specGroupLabel(locale, group),
      specs: (group.specs ?? [])
        .filter((spec) => spec && String(spec.value ?? "").trim() !== "")
        .map((spec) => {
          const resolved: ResolvedSpec = {
            label: specLabel(locale, spec),
            value: String(spec.value),
          };
          if (spec.unit) resolved.unit = spec.unit;
          if (spec.note) resolved.note = spec.note;
          return resolved;
        }),
    }))
    .filter((group) => group.specs.length > 0);
}
