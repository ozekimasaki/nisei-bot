import type { MemoryFact } from "./db.js";
import type { RandomSource } from "./random.js";
import { defaultWords } from "./default-brain.js";

export type QuizItem = {
  label: string;
  isLie: boolean;
};

export function buildMemoryQuiz(
  random: RandomSource,
  facts: MemoryFact[],
  snippets: string[]
): { text: string; items: QuizItem[] } | null {
  if (facts.length < 2) return null;

  const chosen = shuffle(random, facts).slice(0, Math.min(3, facts.length));
  const lieSource = snippets.length > 0 ? random.pick(snippets) : random.pick(defaultWords);
  const lieIndex = random.int(0, chosen.length - 1);
  const lieFact = chosen[lieIndex]!;

  const lines = chosen.map((fact, index) => {
    if (index === lieIndex) {
      return `${index + 1}. ${fact.subject}は${lieSource}`;
    }
    return `${index + 1}. ${fact.subject}は${fact.predicate}`;
  });

  const items: QuizItem[] = chosen.map((fact, index) => ({
    label: `${fact.subject}は${index === lieIndex ? lieSource : fact.predicate}`,
    isLie: index === lieIndex
  }));

  return {
    text: [`おぼえてる`, ...lines, `どれがうそ？`].join("\n"),
    items
  };
}

export function quizCaughtReply(random: RandomSource): string {
  return random.pick([
    "えへん、ばれた",
    "うそ、ばれちゃった",
    "2番はほんと。たぶん",
    "ばれた。でもたぶんそう"
  ]);
}

function shuffle<T>(random: RandomSource, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
