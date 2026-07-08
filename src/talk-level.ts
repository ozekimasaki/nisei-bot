export function clampTalkLevel(level: number): number {
  return Math.min(10, Math.max(0, Math.round(level)));
}

export function resolveTalkLevel(guildLevel: number | null, configDefault: number): number {
  if (guildLevel !== null) return clampTalkLevel(guildLevel);
  return clampTalkLevel(configDefault);
}

export function talkLevelFromTalkativeness(talkativeness: "quiet" | "normal" | "loud"): number {
  switch (talkativeness) {
    case "quiet":
      return 3;
    case "loud":
      return 10;
    default:
      return 5;
  }
}
