import { defaultOpeners, defaultThoughts, defaultWords } from "./default-brain.js";
import type { RandomSource } from "./random.js";

export function withMaybeOpener(random: RandomSource, body: string, rate = 0.35): string {
  if (!body.trim()) return body;
  if (!random.chance(rate)) return body;
  const opener = random.pick(defaultOpeners);
  return opener ? `${opener}\n${body}` : body;
}

const questionOpeners = ["はい", "はいっ", "はーい", "はい！", "はい、えっと"];

export function withQuestionOpener(random: RandomSource, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return random.pick(questionOpeners);

  const core =
    trimmed.replace(/^(?:うん|へへ|なに|あれ|はい)[、。!！\s]*\n?/u, "").trim() || trimmed;
  const opener = random.pick(questionOpeners);
  if (random.chance(0.4)) {
    return `${opener}\n${core}`;
  }
  return `${opener}、${core}`;
}

export function confusedAboutSubject(random: RandomSource, subject: string, hints: string[] = []): string {
  const wordPool = [...defaultWords, ...hints.filter((hint) => hint.length >= 1 && hint.length <= 16)];
  const word = random.pick(wordPool.length > 0 ? wordPool : defaultWords);
  const thought = random.pick(defaultThoughts);

  const templates = [
    `${subject}は${word}！ ちがう？`,
    `${subject}って${word}？`,
    `${word}のにおいする`,
    `あれ、${subject}... ${thought}`,
    `${subject}、${thought}`,
    `${word}になった`,
    `${subject}は${word}だった気がする`,
    `${subject}... ${word}かも`
  ];

  return random.pick(templates);
}

export function formatFactAnswerWithConfidence(
  random: RandomSource,
  subject: string,
  predicate: string,
  confidence: number,
  playful = false
): string {
  if (confidence <= 2) {
    return random.pick([
      `たぶん${subject}は${predicate}`,
      `わすれた。${subject}は${predicate}かも`,
      `${subject}… ${predicate}？`
    ]);
  }
  return formatFactAnswer(random, subject, predicate, playful);
}

export function formatFactAnswer(random: RandomSource, subject: string, predicate: string, playful = false): string {
  if (playful) {
    return random.pick([
      `${subject}は${predicate}。へへ`,
      `${subject}、${predicate}だよ`,
      `${predicate}。${subject}の`
    ]);
  }

  return random.pick([
    `${subject}は${predicate}`,
    `${subject}、${predicate}だよ`,
    `${predicate}。${subject}の`
  ]);
}

export function emptyTreasureReply(random: RandomSource): string {
  return random.pick([
    "たからもの、ない。石はある",
    "宝さがし失敗。おやつは？",
    "箱、からっぽ。へへ",
    "たからもの、まだみつけてない",
    "なにもない。スプーンはある"
  ]);
}
