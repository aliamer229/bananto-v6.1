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
  add(SWITCH_2_CHOICE);

  for (const record of records) {
    const slug = record.deviceSlug || slugifyDevice(record.device);
    if (!slug || seen.has(slug)) continue;
    add({
      id: `slug:${slug}`,
      title: record.device || slug,
      slug,
      model: record.deviceModel || "",
      canonical: true,
    });
  }
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
