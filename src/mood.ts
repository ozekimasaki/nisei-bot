import type { RandomSource } from "./random.js";

export type Mood = "normal" | "sleepy" | "genki" | "confused" | "proud";

export class MoodEngine {
  constructor(private readonly random: RandomSource) {}

  nextMood(text: string): Mood {
    if (/眠|ねむ|寝|おやすみ/u.test(text)) return this.random.chance(0.55) ? "sleepy" : "confused";
    if (/すご|えら|勝|天才|かわい/u.test(text)) return this.random.chance(0.5) ? "proud" : "genki";
    if (/なに|何|どうして|わから/u.test(text)) return "confused";
    return this.random.pick(["normal", "normal", "genki", "sleepy", "confused"]);
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
}
