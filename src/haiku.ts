import type { MemoryFact } from "./db.js";
import { defaultWords } from "./default-brain.js";
import type { RandomSource } from "./random.js";

const smallKana = new Set(["ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ァ", "ィ", "ゥ", "ェ", "ォ"]);
const oneMora = new Set(["っ", "ッ", "ー", "ん", "ン"]);
const seasonalWords = ["春", "夏", "秋", "冬", "月", "雪", "花", "風", "蝉", "こたつ", "朝", ...defaultWords];
const fillers = ["かな", "だよ", "なの", "たぶん", "ねむい", "えへへ", "かも", "いる"];

export class MoraEstimator {
  estimate(text: string): number {
    let count = 0;
    let latinRun = false;

    for (const char of text) {
      if (/\s/u.test(char)) continue;
      if (smallKana.has(char)) continue;
      if (oneMora.has(char)) {
        count += 1;
        latinRun = false;
        continue;
      }
      if (/[ぁ-んァ-ン]/u.test(char)) {
        count += 1;
        latinRun = false;
        continue;
      }
      if (/[一-龯々]/u.test(char)) {
        count += 2;
        latinRun = false;
        continue;
      }
      if (/[A-Za-z0-9]/u.test(char)) {
        if (!latinRun) count += 3;
        latinRun = true;
        continue;
      }
      latinRun = false;
      count += 1;
    }

    return Math.max(count, 1);
  }
}

export class HaikuGenerator {
  constructor(
    private readonly random: RandomSource,
    private readonly estimator = new MoraEstimator()
  ) {}

  generate(facts: MemoryFact[], snippets: string[]): string {
    const words = [
      ...seasonalWords,
      ...fillers,
      ...facts.flatMap((fact) => [fact.subject, fact.predicate]),
      ...snippets
    ].filter((word) => word.trim().length > 0);

    const lines = [5, 7, 5].map((target) => this.buildLine(words, target));
    return lines.join("\n");
  }

  numericPoem(count: number, facts: MemoryFact[], snippets: string[]): string {
    const words = [...facts.map((fact) => fact.subject), ...snippets, ...seasonalWords, ...fillers];
    return this.buildLine(words, Math.max(1, Math.min(count, 17)));
  }

  private buildLine(words: string[], target: number): string {
    const lineWords: string[] = [];
    let mora = 0;
    const maxWords = this.random.int(2, 4);

    for (let i = 0; i < maxWords; i += 1) {
      const next = this.random.pick(words);
      lineWords.push(next);
      mora += this.estimator.estimate(next);
      if (mora >= target - 1 && this.random.chance(0.75)) break;
    }

    if (mora < target && this.random.chance(0.65)) {
      lineWords.push(this.random.pick(fillers));
    }

    return lineWords.join("");
  }
}
