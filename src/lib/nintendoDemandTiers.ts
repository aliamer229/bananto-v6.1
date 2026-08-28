/**
 * How well each game sells, judged per title.
 *
 * This is the input the pricing engine cannot compute. A supplier line costing
 * 1,500 IQD says nothing about whether the game is Mario Kart World or a 2022
 * sports title nobody asks for any more, and both appear in this archive at
 * that price. The tier is the commercial judgement; the engine only turns it
 * into a number.
 *
 * Assigned from what each game is: how well known it is, how old, whether it
 * still sells at full price, and whether it is a reason to own the console.
 * A slug with no entry is priced as `standard` and reported, so a new title
 * never silently inherits a guess.
 */

import type { DemandTier } from "./nintendoPricing";

export const DEMAND_TIERS: Readonly<Record<string, DemandTier>> = {
  /* Reasons to own the console. Never discounted, sell for years. */
  "mario-kart-world-switch-2": "flagship",
  "super-smash-bros-ultimate": "flagship",
  "the-legend-of-zelda-breath-of-the-wild-switch-1": "flagship",
  "the-legend-of-zelda-breath-of-the-wild-switch-2-edition": "flagship",
  "the-legend-of-zelda-tears-of-the-kingdom-switch-1": "flagship",
  "the-legend-of-zelda-tears-of-the-kingdom-switch-2-edition": "flagship",
  "minecraft-switch": "flagship",
  "metroid-dread-switch": "flagship",
  "pikmin-4-switch": "flagship",

  /* Well known, still in demand, hold their price. */
  "luigis-mansion-3": "major",
  "super-mario-rpg-switch-1": "major",
  "paper-mario-the-origami-king-switch-1": "major",
  "paper-mario-the-thousand-year-door-switch-1": "major",
  "the-legend-of-zelda-echoes-of-wisdom-switch": "major",
  "the-legend-of-zelda-links-awakening-switch": "major",
  "the-legend-of-zelda-skyward-sword-hd-switch": "major",
  "hyrule-warriors-age-of-imprisonment-switch-2": "major",
  "hyrule-warriors-age-of-calamity-switch": "major",
  "xenoblade-chronicles-2-switch": "major",
  "splatoon-3-expansion-pass": "major",
  "cyberpunk-2077-ultimate-edition-switch-2": "major",
  "hogwarts-legacy-switch-2": "major",
  "hollow-knight-switch-1": "major",
  "hades-switch": "major",
  "hades-ii-nintendo-switch-2-edition-switch-2": "major",
  "star-wars-outlaws-switch-2": "major",
  "final-fantasy-vii-remake-intergrade-switch-2": "major",
  "the-witcher-3-wild-hunt-remastered-switch-2": "major",
  "the-witcher-3-wild-hunt-complete-edition-switch": "major",
  "pragmata-switch-2": "major",
  "dead-by-daylight-switch-2": "major",
  "ea-sports-fc-27": "major",
  "ea-sports-fc-27-switch-2": "major",
  "ea-sports-fc-26": "major",
  "ea-sports-fc-26-switch-2": "major",
  "mario-vs-donkey-kong-switch-1": "major",
  "pikmin-3-deluxe-switch": "major",
  "pikmin-1-2-switch": "major",
  "tomodachi-life-living-the-dream": "major",
  "lies-of-p-complete-edition-switch-2": "major",
  "hitman-world-of-assassination-signature-edition-switch-2": "major",

  /* Recognised, mid-list, sells steadily but is not a draw. */
  "nintendo-switch-sports": "standard",
  "mario-golf-super-rush-switch-1": "standard",
  "mario-strikers-battle-league-switch-1": "standard",
  "mario-tennis-aces-switch-1": "standard",
  "mario-rabbids-kingdom-battle-switch-1": "standard",
  "hyrule-warriors-definitive-edition-switch": "standard",
  "cuphead-switch": "standard",
  "stray-switch-1": "standard",
  "stray-switch-2": "standard",
  "nier-automata-the-end-of-yorha-edition-switch-1": "standard",
  "final-fantasy-xii-the-zodiac-age": "standard",
  "final-fantasy-viii-remastered": "standard",
  "final-fantasy-vi": "standard",
  "final-fantasy-tactics-the-ivalice-chronicles-nintendo-switch-2-edition-switch-2": "standard",
  "devil-may-cry-5-special-edition-switch-2": "standard",
  "rise-of-the-tomb-raider-20-year-celebration-switch-2": "standard",
  "tomb-raider-definitive-edition-switch-1": "standard",
  "tomb-raider-definitive-edition-switch-2": "standard",
  "wolfenstein-ii-the-new-colossus": "standard",
  "the-hundred-line-last-defense-academy-switch": "standard",
  "kingdom-hearts-integrum-masterpiece-for-cloud": "standard",
  "the-binding-of-isaac-afterbirthplus-switch-1": "standard",
  "unravel-two-switch-1": "standard",
  "ea-sports-fc-25": "standard",
  "ea-sports-fc-24": "standard",
  "efootball-kick-off-switch-2": "standard",
  "fitness-boxing-3-your-personal-trainer": "standard",
  "fitness-boxing-3-your-personal-trainer-nintendo-switch-2-edition-switch-2": "standard",

  /* Old, niche, or long since discounted to nothing. */
  "everybody-1-2-switch-switch-1": "niche",
  "fifa-22-nintendo-switch-legacy-edition": "niche",
  "ea-sports-fifa-23-nintendo-switch-legacy-edition": "niche",
  "world-of-final-fantasy-maxima": "niche",
  "a-plague-tale-innocence-cloud-version-switch1": "niche",
  "go-go-town-switch-1": "niche",
  "go-go-town-nintendo-switch-2-edition-switch-2": "niche",
};

export interface TierDecision {
  tier: DemandTier;
  /** True when no entry existed and the default was used. */
  defaulted: boolean;
}

export function demandTierFor(slug: string): TierDecision {
  const tier = DEMAND_TIERS[slug];
  return tier ? { tier, defaulted: false } : { tier: "standard", defaulted: true };
}
