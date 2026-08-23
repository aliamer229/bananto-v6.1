/**
 * Canonical game-on-device performance model.
 *
 * Hardware products describe maximum capabilities. These records describe what
 * a specific game actually does on a specific device. Never derive one from the
 * other: the game record is the source of truth and the D1 relationship tables
 * are only an indexed/history projection of this data.
 */

export type VerificationStatus = "verified" | "official" | "technical_analysis" | "unverified";
export type PerformanceInformationStatus = "available" | "not_published" | "not_tested";

export interface DeviceModePerformance {
  supported?: boolean;
  resolution?: string;
  resolutionDynamic?: string;
  renderingResolution?: string;
  outputResolution?: string;
  fps?: string;
  fpsMin?: string;
  fpsMax?: string;
  refreshRate?: string;
  hdr?: boolean;
  vrr?: boolean;
  mode?: string;
  notes?: string;
}

export interface NamedPerformanceMode {
  name: string;
  handheldResolution?: string;
  handheldFps?: string;
  tvResolution?: string;
  tvFps?: string;
  hdr?: boolean;
  vrr?: boolean;
  notes?: string;
}

export interface DevicePerformance {
  device: string;
  deviceSlug: string;
  deviceModel?: string;
  hardwareId?: string;
  informationStatus?: PerformanceInformationStatus;
  unavailableReason?: string;
  handheld?: DeviceModePerformance;
  tv?: DeviceModePerformance;
  modes?: NamedPerformanceMode[];
  upscaling?: string;
  rayTracing?: boolean;
  rayTracingMode?: string;
  loadingTime?: string;
  loadingNotes?: string;
  gameVersion?: string;
  patchVersion?: string;
  testedDate?: string;
  sourceName?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  verificationStatus?: VerificationStatus;
  performanceNotes?: string;
}

export interface PerformanceValidationIssue {
  key: string;
  message: string;
  severity: "error" | "warning";
}

type Record_ = Record<string, unknown>;

const text = (value: unknown): string =>
  value == null || typeof value === "object" ? "" : String(value).trim();

const bool = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
};

const compact = <T extends Record_>(value: T): T => {
  const record = value as Record_;
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (entry === undefined || entry === null || entry === "") delete record[key];
    else if (Array.isArray(entry)) {
      const filtered = entry.filter(Boolean);
      if (filtered.length === 0) delete record[key];
      else record[key] = filtered;
    }
  }
  return value;
};

export function slugifyDevice(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/nintendo\s+switch\s*ii\b/g, "nintendo switch 2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDeviceMode(value: unknown): DeviceModePerformance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record_;
  const normalized = compact({
    supported: bool(input["supported"]),
    resolution: text(input["resolution"]),
    resolutionDynamic: text(input["resolutionDynamic"] ?? input["resolution_dynamic"]),
    renderingResolution: text(input["renderingResolution"] ?? input["rendering_resolution"]),
    outputResolution: text(input["outputResolution"] ?? input["output_resolution"]),
    fps: text(input["fps"]),
    fpsMin: text(input["fpsMin"] ?? input["fps_min"]),
    fpsMax: text(input["fpsMax"] ?? input["fps_max"]),
    refreshRate: text(input["refreshRate"] ?? input["refresh_rate"]),
    hdr: bool(input["hdr"]),
    vrr: bool(input["vrr"]),
    mode: text(input["mode"]),
    notes: text(input["notes"]),
  } as Record_) as unknown as DeviceModePerformance;
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeNamedMode(value: unknown): NamedPerformanceMode | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record_;
  const normalized = compact({
    name: text(input["name"]),
    handheldResolution: text(input["handheldResolution"] ?? input["handheld_resolution"]),
    handheldFps: text(input["handheldFps"] ?? input["handheld_fps"]),
    tvResolution: text(input["tvResolution"] ?? input["tv_resolution"]),
    tvFps: text(input["tvFps"] ?? input["tv_fps"]),
    hdr: bool(input["hdr"]),
    vrr: bool(input["vrr"]),
    notes: text(input["notes"]),
  } as Record_) as unknown as NamedPerformanceMode;
  return normalized.name ? normalized : undefined;
}

export function normalizeDevicePerformance(value: unknown): DevicePerformance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record_;
  const device = text(input["device"] ?? input["deviceName"] ?? input["device_name"]);
  const deviceSlug =
    slugifyDevice(input["deviceSlug"] ?? input["device_slug"]) || slugifyDevice(device);
  if (!device && !deviceSlug) return undefined;

  const rawModes = Array.isArray(input["modes"])
    ? input["modes"]
    : Array.isArray(input["mode"])
      ? input["mode"]
      : [];
  const modes = rawModes.map(normalizeNamedMode).filter(Boolean) as NamedPerformanceMode[];

  return compact({
    device: device || deviceSlug,
    deviceSlug,
    deviceModel: text(input["deviceModel"] ?? input["device_model"]),
    hardwareId: text(input["hardwareId"] ?? input["hardware_id"]),
    informationStatus: text(
      input["informationStatus"] ?? input["information_status"],
    ) as PerformanceInformationStatus,
    unavailableReason: text(input["unavailableReason"] ?? input["unavailable_reason"]),
    handheld: normalizeDeviceMode(input["handheld"]),
    tv: normalizeDeviceMode(input["tv"]),
    modes: modes.length ? modes : undefined,
    upscaling: text(input["upscaling"]),
    rayTracing: bool(input["rayTracing"] ?? input["ray_tracing"]),
    rayTracingMode: text(input["rayTracingMode"] ?? input["ray_tracing_mode"]),
    loadingTime: text(input["loadingTime"] ?? input["loading_time"]),
    loadingNotes: text(input["loadingNotes"] ?? input["loading_notes"]),
    gameVersion: text(input["gameVersion"] ?? input["game_version"]),
    patchVersion: text(input["patchVersion"] ?? input["patch_version"]),
    testedDate: text(input["testedDate"] ?? input["tested_date"]),
    sourceName: text(input["sourceName"] ?? input["source_name"]),
    sourceUrl: text(input["sourceUrl"] ?? input["source_url"]),
    verifiedAt: text(input["verifiedAt"] ?? input["verified_at"]),
    verificationStatus: text(
      input["verificationStatus"] ?? input["verification_status"],
    ) as VerificationStatus,
    performanceNotes: text(input["performanceNotes"] ?? input["performance_notes"]),
  } as Record_) as unknown as DevicePerformance;
}

export function getDevicePerformanceList(product: Record_): DevicePerformance[] {
  const source = product["devicePerformance"] ?? product["device_performance"];
  const normalized = (Array.isArray(source) ? source : source ? [source] : [])
    .map(normalizeDevicePerformance)
    .filter(Boolean) as DevicePerformance[];

  if (normalized.length) return dedupeDevicePerformance(normalized);

  // Backward compatibility for the pre-v2 flat performance fields. These are
  // only read when no new records exist, and their values are never expanded
  // from hardware capability data.
  const platform = normalizePlatform(product["platform"]);
  const docked = text(product["perfResolutionDocked"] ?? product["performance_tv_resolution"]);
  const handheld = text(
    product["perfResolutionHandheld"] ?? product["performance_handheld_resolution"],
  );
  const fps = text(product["perfFps"] ?? product["performance_fps"]);
  const hasLegacy = docked || handheld || fps || "perfHdr" in product;
  if (!hasLegacy) return [];

  const switch2 = platform === "switch2" || platform === "both";
  return [
    {
      device: switch2 ? "Nintendo Switch 2" : "Nintendo Switch",
      deviceSlug: switch2 ? "nintendo-switch-2" : "nintendo-switch",
      handheld: handheld || fps ? { supported: true, resolution: handheld, fps } : undefined,
      tv: docked || fps ? { supported: true, resolution: docked, fps } : undefined,
      ...(typeof product["perfHdr"] === "boolean"
        ? {
            handheld: {
              supported: true,
              resolution: handheld,
              fps,
              hdr: product["perfHdr"] as boolean,
            },
            tv: {
              supported: true,
              resolution: docked,
              fps,
              hdr: product["perfHdr"] as boolean,
            },
          }
        : {}),
      performanceNotes: text(product["perfNotes"]),
      verificationStatus: "unverified",
    },
  ];
}

export function dedupeDevicePerformance(records: DevicePerformance[]): DevicePerformance[] {
  const byDevice = new Map<string, DevicePerformance>();
  for (const record of records) {
    const key = record.hardwareId || record.deviceSlug || slugifyDevice(record.device);
    if (!key) continue;
    byDevice.set(key, record);
  }
  return [...byDevice.values()];
}

export function normalizePlatform(value: unknown): "switch" | "switch2" | "both" | string {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (["switch2", "nintendoswitch2", "ns2"].includes(normalized)) return "switch2";
  if (["both", "switch1andswitch2", "switchswitch2"].includes(normalized)) return "both";
  if (["switch", "switch1", "nintendoswitch", "ns"].includes(normalized)) return "switch";
  return normalized;
}

export function productSupportsSwitch2(product: Record_): boolean {
  const platform = normalizePlatform(product["platform"]);
  if (platform === "switch2" || platform === "both") return true;

  const compatibility = product["compatibility"];
  const values = Array.isArray(compatibility)
    ? compatibility
    : compatibility
      ? [compatibility]
      : [];
  return values.some((item) => {
    if (typeof item === "string") return /nintendo\s*switch\s*2|switch\s*2/i.test(item);
    if (!item || typeof item !== "object") return false;
    return /nintendo\s*switch\s*2|switch\s*2/i.test(
      Object.values(item as Record_)
        .filter((entry) => typeof entry === "string")
        .join(" "),
    );
  });
}

function modeMissing(mode: DeviceModePerformance | undefined, prefix: string): string[] {
  if (mode?.supported === false) return [];
  const missing: string[] = [];
  const resolution = mode?.outputResolution || mode?.resolution || mode?.resolutionDynamic;
  if (!resolution) missing.push(`${prefix}.resolution`);
  if (!mode?.fps) missing.push(`${prefix}.fps`);
  return missing;
}

export function validateGameDevicePerformance(product: Record_): PerformanceValidationIssue[] {
  const source = product["devicePerformance"] ?? product["device_performance"];
  const rawRecords = (Array.isArray(source) ? source : source ? [source] : [])
    .map(normalizeDevicePerformance)
    .filter(Boolean) as DevicePerformance[];
  const identities = rawRecords.map(
    (record) => record.hardwareId || record.deviceSlug || slugifyDevice(record.device),
  );
  const duplicate = identities.find(
    (identity, index) => identity && identities.indexOf(identity) !== index,
  );
  if (duplicate) {
    return [
      {
        key: "device_performance",
        severity: "error",
        message: `Duplicate performance record for ${duplicate}. Keep one active record per game and hardware device.`,
      },
    ];
  }

  if (!productSupportsSwitch2(product)) return [];

  const records = getDevicePerformanceList(product);
  const record = records.find((item) => item.deviceSlug === "nintendo-switch-2");
  if (!record) {
    return [
      {
        key: "device_performance",
        severity: "error",
        message:
          "Nintendo Switch 2 performance information is required. Please provide Handheld resolution/FPS and TV resolution/FPS, or mark an unsupported mode as Not Supported.",
      },
    ];
  }

  if (record.informationStatus === "not_published" || record.informationStatus === "not_tested") {
    const missing: string[] = [];
    if (!record.unavailableReason) missing.push("unavailable_reason");
    if (!record.sourceName && !record.sourceUrl) missing.push("source_name or source_url");
    if (!record.verificationStatus) missing.push("verification_status");
    return missing.length
      ? [
          {
            key: "device_performance",
            severity: "error",
            message: `Performance information is marked ${record.informationStatus}, but the following fields are required: ${missing.join(", ")}.`,
          },
        ]
      : [];
  }

  const missing = [...modeMissing(record.handheld, "handheld"), ...modeMissing(record.tv, "tv")];
  if (!missing.length) return [];
  return [
    {
      key: "device_performance",
      severity: "error",
      message: `Import validation error: Nintendo Switch 2 performance data is required. Missing: ${missing.join(", ")}. If a mode is not supported, mark it as Not Supported.`,
    },
  ];
}

export function requiresPerformanceReview(product: Record_): boolean {
  return productSupportsSwitch2(product) && validateGameDevicePerformance(product).length > 0;
}

function modeSummary(label: string, mode?: DeviceModePerformance): string {
  if (!mode) return "";
  if (mode.supported === false) return `${label}: Not Supported`;
  const resolution = mode.outputResolution || mode.resolution || mode.resolutionDynamic;
  const parts = [resolution, mode.fps ? `${mode.fps}${/fps/i.test(mode.fps) ? "" : " FPS"}` : ""];
  if (mode.hdr) parts.push("HDR");
  if (mode.vrr) parts.push("VRR");
  return `${label}: ${parts.filter(Boolean).join(" / ")}`;
}

export function performanceSummary(record: DevicePerformance): string {
  return [modeSummary("Handheld", record.handheld), modeSummary("TV", record.tv)]
    .filter(Boolean)
    .join(" · ");
}

export function parseFps(value: unknown): number {
  const values =
    text(value)
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite) ?? [];
  return values.length ? Math.max(...values) : 0;
}

export function resolutionRank(value: unknown): number {
  const normalized = text(value).toLowerCase();
  if (/4k|3840\s*[x×]\s*2160|2160p/.test(normalized)) return 2160;
  if (/1440p|2560\s*[x×]\s*1440/.test(normalized)) return 1440;
  if (/1080p|1920\s*[x×]\s*1080/.test(normalized)) return 1080;
  if (/900p/.test(normalized)) return 900;
  if (/720p|1280\s*[x×]\s*720/.test(normalized)) return 720;
  const vertical = normalized.match(/(\d{3,4})p/);
  return vertical ? Number(vertical[1]) : 0;
}

export function performanceMatches(record: DevicePerformance, filters: readonly string[]): boolean {
  if (!filters.length) return true;
  const fpsValues = [
    record.handheld?.fps,
    record.handheld?.fpsMin,
    record.handheld?.fpsMax,
    record.tv?.fps,
    record.tv?.fpsMin,
    record.tv?.fpsMax,
    ...(record.modes || []).flatMap((mode) => [mode.handheldFps, mode.tvFps]),
  ].flatMap(
    (value) =>
      text(value)
        .match(/\d+(?:\.\d+)?/g)
        ?.map(Number) || [],
  );
  const resolutionValues = [
    record.handheld?.resolution,
    record.handheld?.resolutionDynamic,
    record.handheld?.renderingResolution,
    record.handheld?.outputResolution,
    record.tv?.resolution,
    record.tv?.resolutionDynamic,
    record.tv?.renderingResolution,
    record.tv?.outputResolution,
    ...(record.modes || []).flatMap((mode) => [mode.handheldResolution, mode.tvResolution]),
  ]
    .map(resolutionRank)
    .filter(Boolean);
  const blob = JSON.stringify(record).toLowerCase();
  return filters.every((filter) => {
    switch (filter.toLowerCase()) {
      case "30":
      case "40":
      case "60":
      case "120":
        return fpsValues.includes(Number(filter));
      case "1080p":
        return resolutionValues.includes(1080);
      case "1440p":
        return resolutionValues.includes(1440);
      case "4k":
        return resolutionValues.includes(2160);
      case "hdr":
        return record.handheld?.hdr === true || record.tv?.hdr === true;
      case "vrr":
        return record.handheld?.vrr === true || record.tv?.vrr === true;
      case "handheld":
        return record.handheld?.supported !== false && Boolean(record.handheld);
      case "tv":
      case "tv mode":
        return record.tv?.supported !== false && Boolean(record.tv);
      case "ray-tracing":
      case "ray tracing":
        return record.rayTracing === true;
      default:
        return blob.includes(filter.toLowerCase());
    }
  });
}
