import { describe, expect, it } from "vitest";
import {
  dedupeDevicePerformance,
  mergeDevicePerformanceRecords,
  validateGameDevicePerformance,
  type DevicePerformance,
} from "./devicePerformance";

describe("device performance deduplication and smart merging", () => {
  it("smartly merges duplicate records, prioritizing the more complete record while retaining extra info", () => {
    const recordA: DevicePerformance = {
      device: "Nintendo Switch 2",
      deviceSlug: "nintendo-switch-2",
      hardwareId: "prd_acf4c89908764c62",
      informationStatus: "available",
      handheld: {
        supported: true,
        resolution: "1080p",
        fps: "60fps",
      },
      performanceNotes: "Tested on devkit v1",
    };

    const recordB: DevicePerformance = {
      device: "Nintendo Switch 2",
      deviceSlug: "nintendo-switch-2",
      hardwareId: "prd_acf4c89908764c62",
      informationStatus: "available",
      tv: {
        supported: true,
        resolution: "4K (DLSS)",
        fps: "60fps",
        hdr: true,
      },
      verifiedAt: "2026-05-01",
      verificationStatus: "official",
      sourceName: "Nintendo Direct",
    };

    const merged = mergeDevicePerformanceRecords(recordA, recordB);
    expect(merged.hardwareId).toBe("prd_acf4c89908764c62");
    expect(merged.handheld?.resolution).toBe("1080p");
    expect(merged.tv?.resolution).toBe("4K (DLSS)");
    expect(merged.tv?.hdr).toBe(true);
    expect(merged.verificationStatus).toBe("official");
    expect(merged.sourceName).toBe("Nintendo Direct");
    expect(merged.performanceNotes).toContain("Tested on devkit v1");
  });

  it("dedupeDevicePerformance consolidates array with duplicate hardwareId into unique list", () => {
    const records: DevicePerformance[] = [
      {
        device: "Nintendo Switch 2",
        hardwareId: "prd_acf4c89908764c62",
        handheld: { supported: true, resolution: "1080p", fps: "60" },
      },
      {
        device: "Nintendo Switch 2",
        hardwareId: "prd_acf4c89908764c62",
        tv: { supported: true, resolution: "4K", fps: "60" },
      },
      {
        device: "Nintendo Switch OLED",
        hardwareId: "prd_switch_oled_001",
        handheld: { supported: true, resolution: "720p", fps: "30" },
      },
    ];

    const deduped = dedupeDevicePerformance(records);
    expect(deduped).toHaveLength(2);
    const switch2 = deduped.find((r) => r.hardwareId === "prd_acf4c89908764c62");
    expect(switch2).toBeDefined();
    expect(switch2?.handheld?.resolution).toBe("1080p");
    expect(switch2?.tv?.resolution).toBe("4K");
  });

  it("validateGameDevicePerformance does not block save when duplicates exist in product form", () => {
    const productWithDuplicates = {
      id: "prd_acf4c89908764c62",
      platform: "switch2",
      devicePerformance: [
        {
          device: "Nintendo Switch 2",
          hardwareId: "prd_acf4c89908764c62",
          deviceSlug: "nintendo-switch-2",
          handheld: { supported: true, resolution: "1080p", fps: "60" },
        },
        {
          device: "Nintendo Switch 2",
          hardwareId: "prd_acf4c89908764c62",
          deviceSlug: "nintendo-switch-2",
          tv: { supported: true, resolution: "4K", fps: "60" },
        },
      ],
    };

    const issues = validateGameDevicePerformance(productWithDuplicates);
    const blockingErrors = issues.filter((i) => i.severity === "error");
    // Handheld and TV are both present across the merged records so no missing mode errors occur
    expect(blockingErrors).toHaveLength(0);
    // Duplicate warning is recorded
    const duplicateWarning = issues.find((i) => i.severity === "warning");
    expect(duplicateWarning?.message).toContain("Duplicate performance record");
  });
});
