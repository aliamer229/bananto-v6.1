import { createHash } from "node:crypto";

export const COMMERCIAL_FIELDS = [
  "price",
  "cost",
  "stock",
  "isHidden",
  "isActive",
  "isInfiniteStock",
  "options",
  "types",
  "trade_enabled",
  "trade_value_iqd",
  "trade_value_locked",
  "store_offer_bonus_iqd",
  "displayOrder",
  "status",
  "category",
  "categoryId",
  "kind",
];

export const MEDIA_ROLES = [
  "cartridgeImage",
  "nintendoCardImage",
  "coverImage",
  "coverHiResImage",
  "bannerImages",
  "galleryImages",
];

const OFFICIAL_FIELDS = [
  "nsuid",
  "product_code",
  "title_id",
  "publisher",
  "developer",
  "releaseDate",
  "genres",
  "ageRating",
  "numberOfPlayers",
  "nintendoPlayModes",
  "tvMode",
  "tabletopMode",
  "handheldMode",
  "nintendoCloudSaves",
  "nintendoOnlineRequired",
  "size",
  "downloadSizeGb",
  "requiredSpaceGb",
  "microSdRecommended",
  "arabicSupport",
  "dlc",
];

const stable = (value) => JSON.stringify(value);

export function sha256Json(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function verifyExpectedSnapshot(current, expected) {
  const issues = [];
  if (expected.documentSha256 && sha256Json(current) !== expected.documentSha256) {
    issues.push(
      `documentSha256: expected ${expected.documentSha256}, found ${sha256Json(current)}`,
    );
  }
  for (const key of ["title", "slug", "platform", "price", "cost", "isHidden"]) {
    if (!(key in expected)) continue;
    if (stable(current?.[key]) !== stable(expected[key])) {
      issues.push(`${key}: expected ${stable(expected[key])}, found ${stable(current?.[key])}`);
    }
  }
  if (Array.isArray(current?.options) && current.options.length !== expected.optionCount) {
    issues.push(`options: expected ${expected.optionCount}, found ${current.options.length}`);
  }
  if (Array.isArray(current?.types) && current.types.length !== expected.typeCount) {
    issues.push(`types: expected ${expected.typeCount}, found ${current.types.length}`);
  }
  return issues;
}

export function officialFields(metadata, officialUrl, reviewedAt) {
  const patch = {};
  for (const key of OFFICIAL_FIELDS) {
    if (metadata?.[key] !== undefined && metadata?.[key] !== null) patch[key] = metadata[key];
  }
  const languages = Array.isArray(metadata?.supportedLanguages)
    ? metadata.supportedLanguages.filter(Boolean)
    : [];
  if (languages.length) {
    patch.supportedLanguages = languages.join(", ");
    patch.languagesText = languages;
  }
  if (metadata?.description) {
    patch.description = metadata.description;
    patch.descriptionEn = metadata.description;
  }
  patch.nintendoEshopUrl = officialUrl;
  patch.eshopUrl = officialUrl;
  patch.officialUrl = metadata?.officialUrl || officialUrl;
  if (metadata?.downloadSizeGb) {
    patch.storageNotes = `Nintendo lists a ${metadata.downloadSizeGb} GB download. Free-space requirements can increase with updates.`;
  }
  patch.nintendoNotes = `Nintendo product identity and store facts were verified against the official listing on ${reviewedAt}. Performance values are included only where an official source publishes them.`;
  return patch;
}

export function buildReviewedProduct({
  current,
  entry,
  metadata,
  commonClearFields = [],
  mediaPatch = {},
  reviewedAt,
  updatedAt,
}) {
  if (!current || String(current.id) !== String(entry.id)) {
    throw new Error(`immutable id mismatch for ${entry.id}`);
  }
  const snapshotIssues = verifyExpectedSnapshot(current, entry.expected || {});
  if (snapshotIssues.length) {
    throw new Error(`production drift for ${entry.id}: ${snapshotIssues.join("; ")}`);
  }
  const forbidden = COMMERCIAL_FIELDS.filter((field) => field in (entry.patch || {}));
  if (forbidden.length) {
    throw new Error(`review patch may not edit commercial fields: ${forbidden.join(", ")}`);
  }

  const next = { ...current };
  for (const field of [...commonClearFields, ...(entry.clearFields || [])]) delete next[field];
  Object.assign(
    next,
    officialFields(metadata, entry.official.url, reviewedAt),
    entry.patch || {},
    mediaPatch,
    { updatedAt },
  );

  for (const field of COMMERCIAL_FIELDS) {
    if (stable(next[field]) !== stable(current[field])) {
      throw new Error(`commercial field changed for ${entry.id}: ${field}`);
    }
  }
  return next;
}

export function changedFields(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((key) => stable(before?.[key]) !== stable(after?.[key]))
    .sort();
}

export function mediaEntries(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? item.url || item.imageUrl || item.src || ""
          : "",
    )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function mergeOnlyRequestedMedia(current, candidatePatch, requestedRoles) {
  const patch = {};
  for (const role of requestedRoles) {
    if (candidatePatch?.[role] !== undefined) patch[role] = candidatePatch[role];
  }
  // The returned object deliberately contains no other role. Spreading it over
  // the current document therefore preserves every verified admin asset.
  void current;
  return patch;
}
