import { describe, expect, it } from "vitest";
import { demandTierFor } from "./nintendoDemandTiers";

const SEPTEMBER_2026_BATCH = [
  "katana-zero",
  "shovel-knight-specter-of-torment",
  "shovel-knight-dig",
  "shovel-knight-treasure-trove",
  "tales-of-arise-beyond-the-dawn-edition",
  "rune-factory-4-special",
  "tales-of-vesperia-definitive-edition",
  "gunvolt-chronicles-luminous-avenger-ix-2",
  "zettai-kaikyuu-gakuen",
  "fuyuzono-sacrifice",
  "triangle-strategy",
  "the-adventures-of-elliot-the-millennium-tales",
  "trails-in-the-sky-2nd-chapter",
  "trails-in-the-sky-2nd-chapter-nintendo-switch-2-edition",
  "danganronpa-2x2-switch1",
  "danganronpa-2x2-switch2",
  "nobunaga-s-ambition-awakening-complete-edition",
  "star-fox",
  "atelier-ryza-secret-trilogy-deluxe-pack-switch1",
  "atelier-ryza-secret-trilogy-deluxe-pack-switch2",
  "divinity-original-sin-2-definitive-edition",
  "onimusha-2-samurai-s-destiny",
  "onimusha-warlords",
  "crash-bandicoot-n-sane-trilogy",
  "onimusha-way-of-the-sword",
  "spongebob-squarepants-titans-of-the-tide-switch1",
  "spongebob-squarepants-titans-of-the-tide-switch2",
  "luigi-s-mansion-2-hd",
] as const;

describe("September 2026 supplier batch demand tiers", () => {
  it("has an explicit tier for every import slug", () => {
    for (const slug of SEPTEMBER_2026_BATCH) {
      const decision = demandTierFor(slug);
      expect(decision.defaulted, slug).toBe(false);
    }
  });
});
