import type { MemoryFact } from "./db.js";
import type { RandomSource } from "./random.js";
import { confusedAboutSubject, formatFactAnswer, formatFactAnswerWithConfidence, withMaybeOpener } from "./utterance.js";

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

  answerFact(
    subject: string,
    fact: MemoryFact | null,
    otherFacts: MemoryFact[],
    overrides?: { memoryMixRate?: number }
  ): FactAnswer {
    const memoryMixRate = overrides?.memoryMixRate ?? this.memoryMixRate;

    if (!fact) {
      if (otherFacts.length > 0 && this.random.chance(0.45)) {
        const other = this.random.pick(otherFacts);
        return {
          text: withMaybeOpener(this.random, `${subject}は${other.predicate}！ ちがう？`),
          misunderstanding: {
            subject,
            wrongPredicate: other.predicate,
            sourcePredicate: other.subject
          }
        };
      }
      const hints = otherFacts.map((item) => item.predicate);
      return { text: withMaybeOpener(this.random, confusedAboutSubject(this.random, subject, hints)) };
    }

    if (otherFacts.length > 0 && this.random.chance(memoryMixRate)) {
      const other = this.random.pick(otherFacts);
      return {
        text: withMaybeOpener(this.random, `${subject}は${other.predicate}。あ、${fact.predicate}？`),
        misunderstanding: {
          subject,
          wrongPredicate: other.predicate,
          sourcePredicate: fact.predicate
        }
      };
    }

    if (this.random.chance(this.confusionRate * 0.25)) {
      return {
        text: withMaybeOpener(
          this.random,
          formatFactAnswer(this.random, subject, fact.predicate, true)
        )
      };
    }

    const confidence = fact.confidence;
    if (confidence <= 2) {
      return {
        text: withMaybeOpener(this.random, formatFactAnswerWithConfidence(this.random, subject, fact.predicate, confidence))
      };
    }

    return { text: withMaybeOpener(this.random, formatFactAnswer(this.random, subject, fact.predicate)) };
  }

  maybeWrongGreeting(kind: "morning" | "night" | "home" | "other", sleepyBoost = 0): string {
    let body: string;
    if (kind === "morning") {
      body = this.random.chance(0.45 + sleepyBoost) ? "おやすみ" : "おはよ";
    } else if (kind === "night") {
      body = this.random.chance(0.55 + sleepyBoost * 0.5) ? "おはよ" : "おやすみ";
    } else if (kind === "home") {
      body = this.random.chance(0.45) ? "いってらっしゃい" : "おかえり";
    } else {
      body = this.random.pick(["こんちは", "ばんは", "おはよ"]);
    }
    return withMaybeOpener(this.random, body);
  }

  mutate(text: string): string {
    if (!this.random.chance(this.confusionRate)) return text;
    const endings = ["かも", "ってゆってた", "だった", "なの？", "えへん"];
    return `${text.replace(/[。.!！?？]+$/u, "")}${this.random.pick(endings)}`;
  }
}
