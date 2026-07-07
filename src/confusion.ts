import type { MemoryFact } from "./db.js";
import type { RandomSource } from "./random.js";

export type FactAnswer = {
  text: string;
  misunderstanding?: {
    subject: string;
    wrongPredicate: string;
    sourcePredicate?: string;
  };
};

export class ConfusionEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly confusionRate: number,
    private readonly memoryMixRate: number
  ) {}

  answerFact(subject: string, fact: MemoryFact | null, otherFacts: MemoryFact[]): FactAnswer {
    if (!fact) {
      if (otherFacts.length > 0 && this.random.chance(0.35)) {
        const other = this.random.pick(otherFacts);
        return {
          text: `はい\n${subject}は${other.predicate}！ ちがう？`,
          misunderstanding: {
            subject,
            wrongPredicate: other.predicate,
            sourcePredicate: other.subject
          }
        };
      }
      return { text: `はい\n${subject}しらない` };
    }

    if (otherFacts.length > 0 && this.random.chance(this.memoryMixRate)) {
      const other = this.random.pick(otherFacts);
      return {
        text: `はい\n${subject}は${other.predicate}。あ、${fact.predicate}？`,
        misunderstanding: {
          subject,
          wrongPredicate: other.predicate,
          sourcePredicate: fact.predicate
        }
      };
    }

    if (this.random.chance(this.confusionRate * 0.25)) {
      return { text: `はい\n${subject}は${fact.predicate}。へへ` };
    }

    return { text: `はい\n${subject}は${fact.predicate}` };
  }

  maybeWrongGreeting(kind: "morning" | "night" | "home" | "other"): string {
    if (kind === "morning") {
      return this.random.chance(0.45) ? "はい\nおやすみ" : "はい\nおはよ";
    }
    if (kind === "night") {
      return this.random.chance(0.55) ? "はい\nおはよ" : "はい\nおやすみ";
    }
    if (kind === "home") {
      return this.random.chance(0.45) ? "はい\nいってらっしゃい" : "はい\nおかえり";
    }
    return this.random.pick(["はい\nこんちは", "はい\nばんは", "はい\nおはよ"]);
  }

  mutate(text: string): string {
    if (!this.random.chance(this.confusionRate)) return text;
    const endings = ["かも", "ってゆってた", "だった", "なの？", "えへん"];
    return `${text.replace(/[。.!！?？]+$/u, "")}${this.random.pick(endings)}`;
  }
}
