import type { RandomSource } from "./random.js";

export type Mood = "normal" | "sleepy" | "genki" | "confused" | "proud";

const MOODS: readonly Mood[] = ["normal", "normal", "genki", "sleepy", "confused"];

export function parseMood(value: string | null | undefined): Mood | null {
  if (value === "normal" || value === "sleepy" || value === "genki" || value === "confused" || value === "proud") {
    return value;
  }
  return null;
}

export class MoodEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly persistRate: number
  ) {}

  nextMood(text: string, previousMood: Mood | null = null): Mood {
    if (previousMood && this.random.chance(this.persistRate)) {
      return previousMood;
    }

    if (/眠|ねむ|寝|おやすみ/u.test(text)) return this.random.chance(0.55) ? "sleepy" : "confused";
    if (/すご|えら|勝|天才|かわい/u.test(text)) return this.random.chance(0.5) ? "proud" : "genki";
    if (/なに|何|どうして|わから/u.test(text)) return "confused";

    const hour = new Date().getHours();
    const pool: Mood[] = [...MOODS];

    if (hour >= 0 && hour < 6) {
      pool.push("sleepy", "sleepy", "sleepy");
    } else if (hour >= 12 && hour < 17) {
      pool.push("genki", "genki");
    }

    return this.random.pick(pool);
  }

  suffix(mood: Mood): string {
    switch (mood) {
      case "sleepy":
        return " ねむい";
      case "genki":
        return "！";
      case "confused":
        return " たぶん";
      case "proud":
        return " えらい";
      default:
        return "";
    }
  }

  questionSuffix(mood: Mood): string {
    if (mood === "sleepy" && this.random.chance(0.35)) return " ねむい";
    if (mood === "confused" && this.random.chance(0.25)) return " たぶん";
    return "";
  }

  greetingWrongBoost(mood: Mood): number {
    return mood === "sleepy" ? 0.15 : 0;
  }
}
