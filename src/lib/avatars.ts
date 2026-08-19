/**
 * Ready-made avatar gallery. Deterministic remote illustrations, so an account
 * with no uploaded picture still gets a friendly face.
 */
const SEEDS = [
  "banana",
  "mario",
  "zelda",
  "kirby",
  "yoshi",
  "peach",
  "luigi",
  "samus",
  "pikachu",
  "donkey",
  "splatoon",
  "starfox",
];

export const AVATAR_GALLERY: string[] = SEEDS.map(
  (seed) =>
    `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=fce874,fae896,fdf0d5`,
);

export function randomAvatar(): string {
  const index = Math.floor(Math.random() * AVATAR_GALLERY.length);
  return AVATAR_GALLERY[index] ?? AVATAR_GALLERY[0]!;
}

/** Cute Arabic display names used when the member skips the profile step. */
const NAMES = [
  "لاعب الموز",
  "بطل الكارتلج",
  "صائد الألعاب",
  "نجم السويتش",
  "قناص الموز",
  "أسطورة الكونترول",
  "مستكشف الممالك",
  "فارس البكسل",
];

export function randomDisplayName(): string {
  const base = NAMES[Math.floor(Math.random() * NAMES.length)] ?? "لاعب الموز";
  return `${base} ${Math.floor(100 + Math.random() * 900)}`;
}
