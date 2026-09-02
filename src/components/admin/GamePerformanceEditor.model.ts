import { slugifyDevice, type DevicePerformance } from "@/lib/devicePerformance";

type Record_ = Record<string, any>;

export type HardwareChoice = Record_ & {
  id: string;
  title: string;
  slug: string;
  canonical?: boolean;
};

export const SWITCH_2_CHOICE: HardwareChoice = {
  id: "slug:nintendo-switch-2",
  title: "Nintendo Switch 2",
  slug: "nintendo-switch-2",
  canonical: true,
};

/**
 * A game editor must not depend on the hardware category being present in the
 * currently paginated admin table. Real hardware rows win; the canonical slug
 * remains available while that table is loading or if an old record only kept
 * the device name.
 */
export function buildHardwareChoices(
  hardwareProducts: Record_[],
  records: DevicePerformance[],
): HardwareChoice[] {
  const choices: HardwareChoice[] = [];
  const seen = new Set<string>();
  const add = (choice: HardwareChoice) => {
    const slug = slugifyDevice(choice.slug || choice.title);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    choices.push({ ...choice, slug });
  };

  for (const hardware of hardwareProducts) {
    const title = String(hardware.title || hardware.name || "").trim();
    const slug = slugifyDevice(hardware.slug || title);
    const id = hardware.id == null ? `slug:${slug}` : String(hardware.id);
    if (title && slug) add({ ...hardware, id, title, slug });
  }

  // Keep a persisted hardware id selectable while the hardware request is
  // still loading. Adding the slug-only fallback before records used to hide
  // this option (same slug), leaving the <select> with a value that had no
  // matching <option> and therefore looked empty.
  for (const record of records) {
    const slug = record.deviceSlug || slugifyDevice(record.device);
    if (!slug || seen.has(slug)) continue;
    add({
      id: record.hardwareId || `slug:${slug}`,
      title: record.device || slug,
      slug,
      model: record.deviceModel || "",
      canonical: true,
    });
  }
  add(SWITCH_2_CHOICE);
  return choices;
}

/**
 * Nintendo Switch 2 is selected automatically for every game. Unknown
 * game-specific FPS/resolution is represented honestly as unpublished rather
 * than copying the console's maximum capability or inventing measurements.
 */
export function defaultSwitch2Performance(hardwareProducts: Record_[] = []): DevicePerformance {
  const preferred =
    buildHardwareChoices(hardwareProducts, []).find(
      (hardware) => slugifyDevice(hardware.slug || hardware.title) === "nintendo-switch-2",
    ) || SWITCH_2_CHOICE;

  return {
    device: String(preferred.title || preferred.name || "Nintendo Switch 2"),
    deviceSlug: "nintendo-switch-2",
    hardwareId:
      preferred.id && !String(preferred.id).startsWith("slug:") ? String(preferred.id) : undefined,
    deviceModel: String(preferred.model || preferred.modelNumber || ""),
    informationStatus: "not_published",
    unavailableReason:
      "Game-specific Nintendo Switch 2 performance metrics have not been verified.",
    sourceName: "Nintendo Switch 2 compatibility review",
    verificationStatus: "unverified",
    modes: [],
  };
}

/**
 * Every Nintendo game is playable on Nintendo Switch 2, including compatible
 * Switch 1 titles. Keep one Switch 2 row attached to the form and bind it to
 * the real hardware product when that row is available. Existing verified
 * measurements are preserved; only a missing device identity is repaired.
 */
export function ensureSwitch2Performance(
  records: DevicePerformance[],
  hardwareProducts: Record_[] = [],
): DevicePerformance[] {
  const canonical = defaultSwitch2Performance(hardwareProducts);
  const switch2Index = records.findIndex(
    (record) => slugifyDevice(record.deviceSlug || record.device) === "nintendo-switch-2",
  );

  if (switch2Index >= 0) {
    const current = records[switch2Index]!;
    const hardwareId = canonical.hardwareId || current.hardwareId;
    const deviceModel = canonical.deviceModel || current.deviceModel;
    const hasKnownMode =
      current.handheld?.supported === false ||
      current.tv?.supported === false ||
      Boolean(
        current.handheld?.resolution ||
          current.handheld?.outputResolution ||
          current.handheld?.fps ||
          current.tv?.resolution ||
          current.tv?.outputResolution ||
          current.tv?.fps ||
          current.modes?.some(
            (mode) =>
              mode.handheldResolution || mode.handheldFps || mode.tvResolution || mode.tvFps,
          ),
      );
    const needsHonestUnknownState = current.informationStatus === "available" && !hasKnownMode;
    const needsUnknownMetadata =
      current.informationStatus === "not_published" ||
      current.informationStatus === "not_tested" ||
      needsHonestUnknownState;
    const repairedStatus = needsHonestUnknownState
      ? canonical.informationStatus
      : current.informationStatus;
    const unavailableReason = needsUnknownMetadata
      ? current.unavailableReason || canonical.unavailableReason
      : current.unavailableReason;
    const sourceName = needsUnknownMetadata
      ? current.sourceName || canonical.sourceName
      : current.sourceName;
    const verificationStatus = needsUnknownMetadata
      ? current.verificationStatus || canonical.verificationStatus
      : current.verificationStatus;
    const alreadyBound =
      current.device === canonical.device &&
      current.deviceSlug === canonical.deviceSlug &&
      current.hardwareId === hardwareId &&
      current.deviceModel === deviceModel &&
      current.informationStatus === repairedStatus &&
      current.unavailableReason === unavailableReason &&
      current.sourceName === sourceName &&
      current.verificationStatus === verificationStatus;
    if (alreadyBound) return records;

    return records.map((record, index) =>
      index === switch2Index
        ? {
            ...record,
            device: canonical.device,
            deviceSlug: canonical.deviceSlug,
            hardwareId,
            deviceModel,
            informationStatus: repairedStatus,
            unavailableReason,
            sourceName,
            verificationStatus,
          }
        : record,
    );
  }

  const unidentifiedIndex = records.findIndex(
    (record) => !slugifyDevice(record.deviceSlug || record.device),
  );
  if (unidentifiedIndex >= 0) {
    return records.map((record, index) =>
      index === unidentifiedIndex
        ? {
            ...canonical,
            ...record,
            device: canonical.device,
            deviceSlug: canonical.deviceSlug,
            hardwareId: canonical.hardwareId,
            deviceModel: canonical.deviceModel,
          }
        : record,
    );
  }

  return [...records, canonical];
}
