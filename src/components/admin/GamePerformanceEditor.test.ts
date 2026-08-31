import { describe, expect, it } from "vitest";

import { buildHardwareChoices, defaultSwitch2Performance } from "./GamePerformanceEditor.model";

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
});
