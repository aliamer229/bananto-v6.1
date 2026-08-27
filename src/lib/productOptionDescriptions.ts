/**
 * Standardized customer-facing descriptions for Nintendo product options and types.
 *
 * Rules:
 * 1. Offline Account -> "حساب مشترك"
 * 2. Online Account  -> "حساب خاص بك"
 * 3. Standard / Base / Regular Game -> "اللعبة الأساسية"
 * 4. DLC / Deluxe / Ultimate / Complete / Gold / Expansion -> "اللعبة مع الإضافات"
 *
 * Internal supplier notes, conversion rules, pricing formulas, and legacy descriptions
 * are strictly segregated into `internalNote` and never shown to customers.
 */

import { looksLikeInternalNote } from "./internalMetadata";

export const STANDARD_OPTION_DESCRIPTIONS = {
  OFFLINE: "حساب مشترك",
  ONLINE: "حساب خاص بك",
} as const;

export const STANDARD_TYPE_DESCRIPTIONS = {
  BASE: "اللعبة الأساسية",
  DLC: "اللعبة مع الإضافات",
} as const;

/**
 * Normalizes an option name or ID to the official Arabic customer description:
 * - Offline Account -> "حساب مشترك"
 * - Online Account  -> "حساب خاص بك"
 */
export function resolveOptionStandardDescription(
  nameOrId?: unknown,
  fallbackDesc?: unknown,
): string {
  const strName = String(nameOrId || "").trim().toLowerCase();
  const strDesc = typeof fallbackDesc === "string" ? fallbackDesc.trim() : "";

  // Check for internal leakage in the fallback
  const isDescPolluted = strDesc ? looksLikeInternalNote(strDesc) : false;

  // 1. Offline detection
  if (
    strName.includes("offline") ||
    strName.includes("أوفلاين") ||
    strName.includes("مشترك") ||
    strName.includes("مشارك") ||
    strName.includes("shared") ||
    strName.includes("opt_offline") ||
    strName.includes("offline_account")
  ) {
    return STANDARD_OPTION_DESCRIPTIONS.OFFLINE;
  }

  // 2. Online detection
  if (
    strName.includes("online") ||
    strName.includes("أونلاين") ||
    strName.includes("خاص") ||
    strName.includes("شخصي") ||
    strName.includes("personal") ||
    strName.includes("private") ||
    strName.includes("opt_online") ||
    strName.includes("online_account")
  ) {
    return STANDARD_OPTION_DESCRIPTIONS.ONLINE;
  }

  // 3. Check fallback description if name was ambiguous
  if (!isDescPolluted && strDesc) {
    const lowerDesc = strDesc.toLowerCase();
    if (
      lowerDesc.includes("offline") ||
      lowerDesc.includes("أوفلاين") ||
      lowerDesc.includes("مشترك") ||
      lowerDesc.includes("بدون اتصال") ||
      lowerDesc.includes("حساب المتجر")
    ) {
      return STANDARD_OPTION_DESCRIPTIONS.OFFLINE;
    }
    if (
      lowerDesc.includes("online") ||
      lowerDesc.includes("أونلاين") ||
      lowerDesc.includes("خاص") ||
      lowerDesc.includes("شخصي") ||
      lowerDesc.includes("حسابك")
    ) {
      return STANDARD_OPTION_DESCRIPTIONS.ONLINE;
    }
    return strDesc;
  }

  return "";
}

/**
 * Normalizes a type/edition variant to the official Arabic customer description:
 * - Standard / Base / Regular -> "اللعبة الأساسية"
 * - DLC / Deluxe / Ultimate / Gold / Complete / Expansion -> "اللعبة مع الإضافات"
 */
export function resolveTypeStandardDescription(
  nameOrId?: unknown,
  fallbackDesc?: unknown,
): string {
  const strName = String(nameOrId || "").trim().toLowerCase();
  const strDesc = typeof fallbackDesc === "string" ? fallbackDesc.trim() : "";

  // Check for internal leakage in the fallback
  const isDescPolluted = strDesc ? looksLikeInternalNote(strDesc) : false;

  // 1. DLC / Add-on / Deluxe / Expansion detection (Priority over base)
  if (
    strName.includes("dlc") ||
    strName.includes("deluxe") ||
    strName.includes("ultimate") ||
    strName.includes("complete") ||
    strName.includes("gold") ||
    strName.includes("special") ||
    strName.includes("expansion") ||
    strName.includes("pass") ||
    strName.includes("season") ||
    strName.includes("bundle") ||
    strName.includes("إضاف") ||
    strName.includes("محتوى") ||
    strName.includes("فاخر") ||
    strName.includes("ذهبي") ||
    strName.includes("شامل") ||
    /\bplus\b/i.test(strName) ||
    strName.includes("dlc_offline") ||
    strName.includes("dlc_online")
  ) {
    return STANDARD_TYPE_DESCRIPTIONS.DLC;
  }

  // 2. Standard / Base / Regular detection
  if (
    strName.includes("standard") ||
    strName.includes("base") ||
    strName.includes("regular") ||
    strName.includes("أساسي") ||
    strName.includes("اساسي") ||
    strName.includes("قياسي") ||
    strName.includes("عادي") ||
    strName.includes("std") ||
    strName.includes("standard_offline") ||
    strName.includes("standard_online")
  ) {
    return STANDARD_TYPE_DESCRIPTIONS.BASE;
  }

  // 3. Check fallback description if name was ambiguous
  if (!isDescPolluted && strDesc) {
    const lowerDesc = strDesc.toLowerCase();
    if (
      lowerDesc.includes("dlc") ||
      lowerDesc.includes("إضاف") ||
      lowerDesc.includes("توسع") ||
      lowerDesc.includes("سيزون") ||
      lowerDesc.includes("deluxe") ||
      lowerDesc.includes("ultimate") ||
      lowerDesc.includes("فاخر")
    ) {
      return STANDARD_TYPE_DESCRIPTIONS.DLC;
    }
    if (
      lowerDesc.includes("أساس") ||
      lowerDesc.includes("اساس") ||
      lowerDesc.includes("قياس") ||
      lowerDesc.includes("standard") ||
      lowerDesc.includes("base")
    ) {
      return STANDARD_TYPE_DESCRIPTIONS.BASE;
    }
    return strDesc;
  }

  return "";
}

/**
 * Returns combination descriptions when Option and Type are paired together:
 * e.g., "حساب مشترك / اللعبة الأساسية"
 */
export function getCombinedOptionTypeDisplay(
  optionNameOrId?: unknown,
  typeNameOrId?: unknown,
): {
  optionDesc: string;
  typeDesc: string;
  combinedDesc: string;
} {
  const optionDesc = resolveOptionStandardDescription(optionNameOrId);
  const typeDesc = resolveTypeStandardDescription(typeNameOrId);

  const parts = [optionDesc, typeDesc].filter(Boolean);
  const combinedDesc = parts.join(" / ");

  return {
    optionDesc,
    typeDesc,
    combinedDesc,
  };
}

/**
 * Normalizes one option record, guaranteeing:
 * - If `description` had internal/supplier notes, it is moved to `internalNote`
 * - `description` is set to the unified standard Arabic string
 */
export function normalizeProductOption(
  opt: Record<string, unknown>,
): Record<string, unknown> {
  if (!opt || typeof opt !== "object") return opt;

  const name = String(opt["name"] ?? opt["title"] ?? opt["value"] ?? "").trim();
  const id = String(opt["id"] ?? "").trim();
  const existingDesc = String(opt["description"] ?? opt["customerDescription"] ?? "").trim();
  const existingInternal = String(opt["internalNote"] ?? opt["internal_note"] ?? "").trim();

  // If existing description contains supplier notes or internal rules, save to internalNote
  let internalNote = existingInternal;
  if (existingDesc && looksLikeInternalNote(existingDesc) && !internalNote) {
    internalNote = existingDesc;
  }

  // Resolve standard customer-facing description
  const stdDesc = resolveOptionStandardDescription(name || id, existingDesc);

  const out: Record<string, unknown> = {
    ...opt,
    ...(stdDesc ? { description: stdDesc, customerDescription: stdDesc } : {}),
  };

  if (internalNote) {
    out["internalNote"] = internalNote;
  }

  return out;
}

/**
 * Normalizes one type/variant record, guaranteeing:
 * - If `description` had internal/supplier notes, it is moved to `internalNote`
 * - `description` is set to the unified standard Arabic string
 */
export function normalizeProductType(
  typ: Record<string, unknown>,
): Record<string, unknown> {
  if (!typ || typeof typ !== "object") return typ;

  const name = String(typ["name"] ?? typ["title"] ?? typ["value"] ?? "").trim();
  const id = String(typ["id"] ?? "").trim();
  const existingDesc = String(typ["description"] ?? typ["customerDescription"] ?? "").trim();
  const existingInternal = String(typ["internalNote"] ?? typ["internal_note"] ?? "").trim();

  // If existing description contains supplier notes or internal rules, save to internalNote
  let internalNote = existingInternal;
  if (existingDesc && looksLikeInternalNote(existingDesc) && !internalNote) {
    internalNote = existingDesc;
  }

  // Resolve standard customer-facing description
  const stdDesc = resolveTypeStandardDescription(name || id, existingDesc);

  const out: Record<string, unknown> = {
    ...typ,
    ...(stdDesc ? { description: stdDesc, customerDescription: stdDesc } : {}),
  };

  if (internalNote) {
    out["internalNote"] = internalNote;
  }

  return out;
}

/**
 * Cleans and standardizes all options, types, variants, and editions on a product record.
 * Returns the sanitized product and a boolean indicating whether any field was changed.
 */
export function cleanAndStandardizeProductOptions(
  product: Record<string, unknown>,
): { product: Record<string, unknown>; changed: boolean } {
  if (!product || typeof product !== "object") {
    return { product, changed: false };
  }

  let changed = false;
  const out = { ...product };

  // 1. Options
  if (Array.isArray(out["options"])) {
    const cleanedOptions = out["options"].map((opt) => {
      if (!opt || typeof opt !== "object") return opt;
      const rec = opt as Record<string, unknown>;
      const normalized = normalizeProductOption(rec);
      if (
        normalized["description"] !== rec["description"] ||
        normalized["internalNote"] !== rec["internalNote"]
      ) {
        changed = true;
      }
      return normalized;
    });
    out["options"] = cleanedOptions;
  }

  // 2. Types
  if (Array.isArray(out["types"])) {
    const cleanedTypes = out["types"].map((typ) => {
      if (!typ || typeof typ !== "object") return typ;
      const rec = typ as Record<string, unknown>;
      const normalized = normalizeProductType(rec);
      if (
        normalized["description"] !== rec["description"] ||
        normalized["internalNote"] !== rec["internalNote"]
      ) {
        changed = true;
      }
      return normalized;
    });
    out["types"] = cleanedTypes;
  }

  // 3. Variants
  if (Array.isArray(out["variants"])) {
    const cleanedVariants = out["variants"].map((v) => {
      if (!v || typeof v !== "object") return v;
      const rec = v as Record<string, unknown>;
      const normalized = normalizeProductType(rec);
      if (
        normalized["description"] !== rec["description"] ||
        normalized["internalNote"] !== rec["internalNote"]
      ) {
        changed = true;
      }
      return normalized;
    });
    out["variants"] = cleanedVariants;
  }

  // 4. Editions
  if (Array.isArray(out["editions"])) {
    const cleanedEditions = out["editions"].map((ed) => {
      if (!ed || typeof ed !== "object") return ed;
      const rec = ed as Record<string, unknown>;
      const normalized = normalizeProductType(rec);
      if (
        normalized["description"] !== rec["description"] ||
        normalized["internalNote"] !== rec["internalNote"]
      ) {
        changed = true;
      }
      return normalized;
    });
    out["editions"] = cleanedEditions;
  }

  return { product: out, changed };
}
