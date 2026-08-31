import { describe, expect, it } from "vitest";

import {
  buildHardwareChoices,
  defaultSwitch2Performance,
  ensureSwitch2Performance,
} from "./GamePerformanceEditor.model";

describe("GamePerformanceEditor hardware choices", () => {
  it("always exposes Nintendo Switch 2 when the paginated admin page has no hardware rows", () => {
    expect(buildHardwareChoices([], [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "slug:nintendo-switch-2",
          title: "Nintendo Switch 2",
          slug: "nintendo-switch-2",
        }),
      ]),
    );
  });

  it("prefers the real stored hardware product over the canonical fallback", () => {
    const choices = buildHardwareChoices(
      [{ id: "hw-switch-2", title: "Nintendo Switch 2", slug: "nintendo-switch-2" }],
      [],
    );
    expect(choices.filter((choice) => choice.slug === "nintendo-switch-2")).toEqual([
      expect.objectContaining({ id: "hw-switch-2" }),
    ]);
  });

  it("keeps an existing device record selectable even before its hardware row loads", () => {
    const choices = buildHardwareChoices(
      [],
      [{ device: "Nintendo Switch", deviceSlug: "nintendo-switch" }],
    );
    expect(choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "slug:nintendo-switch", title: "Nintendo Switch" }),
      ]),
    );
  });

  it("auto-selects Nintendo Switch 2 without inventing performance numbers", () => {
    const record = defaultSwitch2Performance([]);
    expect(record).toMatchObject({
      device: "Nintendo Switch 2",
      deviceSlug: "nintendo-switch-2",
      informationStatus: "not_published",
      verificationStatus: "unverified",
    });
    expect(record.handheld).toBeUndefined();
    expect(record.tv).toBeUndefined();
  });

  it("adds Nintendo Switch 2 to a Switch 1 game without removing its existing record", () => {
    const records = ensureSwitch2Performance(
      [{ device: "Nintendo Switch", deviceSlug: "nintendo-switch" }],
      [{ id: "hw-switch-2", title: "Nintendo Switch 2", slug: "nintendo-switch-2" }],
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ deviceSlug: "nintendo-switch" });
    expect(records[1]).toMatchObject({
      device: "Nintendo Switch 2",
      deviceSlug: "nintendo-switch-2",
      hardwareId: "hw-switch-2",
      informationStatus: "not_published",
    });
  });

  it("binds an existing Switch 2 record to the real hardware row and preserves metrics", () => {
    const records = ensureSwitch2Performance(
      [
        {
          device: "Nintendo Switch 2",
          deviceSlug: "nintendo-switch-2",
          handheld: { supported: true, resolution: "1080p", fps: "60" },
          verificationStatus: "official",
        },
      ],
      [
        {
          id: "prd_acf4c89908764c62",
          title: "Nintendo Switch 2",
          slug: "nintendo-switch-2",
          model: "Nintendo Switch 2",
        },
      ],
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      hardwareId: "prd_acf4c89908764c62",
      verificationStatus: "official",
      handheld: { supported: true, resolution: "1080p", fps: "60" },
    });
  });
});
