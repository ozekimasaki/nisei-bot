export type AffectionTier = "distant" | "known" | "friendly" | "favorite";

export function affectionTier(affection: number): AffectionTier {
  if (affection >= 10) return "favorite";
  if (affection >= 5) return "friendly";
  if (affection >= 3) return "known";
  return "distant";
}

export function displayNameForUser(name: string, affection: number): string {
  if (affection >= 10) return `${name}ちゃん`;
  return name;
}

export function memoryMixMultiplier(affection: number): number {
  if (affection >= 5) return 0.9;
  return 1;
}

export function wrongUserRateBonus(affection: number): number {
  if (affection <= 2) return 0.04;
  return 0;
}
