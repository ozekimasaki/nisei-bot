import { defaultOpeners, defaultThoughts, defaultWords } from "./default-brain.js";
import type { Mood } from "./mood.js";
import type { RandomSource } from "./random.js";

const shortLearnedReplies = [
  "うん！",
  "うんっ",
  "わかった！",
  "わかった",
  "おぼえた",
  "おぼえた！",
  "メモした",
  "頭に入った",
  "へへ",
  "はいっ",
  "はーい",
  "えへん",
  "なるほど",
  "そうなんだ"
] as const;

const shortDeniedReplies = [
  "うん、ちがう",
  "わかった、じゃない",
  "おぼえた。じゃない方",
  "へへ、ちがう",
  "うん、そうじゃない",
  "わかった、じゃない方"
] as const;

function buildShortLearnedTemplates(mood: Mood, confidence: number): string[] {
  const pool = [...shortLearnedReplies];

  if (confidence > 1) {
    pool.push("もう知ってる", "また教えてくれた");
  }

  switch (mood) {
    case "proud":
      pool.push("えへん！", "できた");
      break;
    case "sleepy":
      pool.push("ねむいけどおぼえた", "zzz…わかった");
      break;
    case "genki":
      pool.push("つよい！", "いける！");
      break;
    case "confused":
      pool.push("たぶんわかった", "え、そうなの");
      break;
    default:
      break;
  }

  return pool;
}

function buildEchoLearnedTemplates(
  subject: string,
  predicate: string,
  mood: Mood,
  confidence: number
): string[] {
  const pool = [
    `${subject}は${predicate}。おぼえた`,
    `${subject}、${predicate}だよ`,
    `${predicate}。${subject}の`
  ];

  if (confidence > 1) {
    pool.push(`もう知ってる。${subject}は${predicate}`, `また教えてくれた。${subject}は${predicate}`);
  }

  switch (mood) {
    case "proud":
      pool.push(`${subject}は${predicate}。えへん`);
      break;
    case "sleepy":
      pool.push(`${subject}…${predicate}…おぼえた`);
      break;
    case "confused":
      pool.push(`${subject}は${predicate}かも。たぶん`);
      break;
    case "genki":
      pool.push(`${subject}は${predicate}！！つよい`);
      break;
    default:
      break;
  }

  return pool;
}

function buildShortDeniedTemplates(mood: Mood): string[] {
  const pool = [...shortDeniedReplies];

  switch (mood) {
    case "proud":
      pool.push("えへん、ちがう");
      break;
    case "sleepy":
      pool.push("ねむいけど、じゃない");
      break;
    case "genki":
      pool.push("ちがう！！");
      break;
    case "confused":
      pool.push("たぶん、じゃない");
      break;
    default:
      break;
  }

  return pool;
}

function buildEchoDeniedTemplates(subject: string, predicate: string, mood: Mood): string[] {
  const pool = [
    `${subject}は${predicate}じゃない。おぼえた`,
    `${subject}、${predicate}じゃない`,
    `じゃない。${subject}は${predicate}じゃない`
  ];

  switch (mood) {
    case "proud":
      pool.push(`${subject}は${predicate}じゃない。えへん`);
      break;
    case "sleepy":
      pool.push(`${subject}…${predicate}じゃない…`);
      break;
    case "confused":
      pool.push(`${subject}は${predicate}じゃないかも`);
      break;
    case "genki":
      pool.push(`${subject}は${predicate}じゃない！！`);
      break;
    default:
      break;
  }

  return pool;
}

export function formatLearnedReply(
  random: RandomSource,
  subject: string,
  predicate: string,
  mood: Mood,
  confidence: number
): string {
  const pool = random.chance(0.25)
    ? buildEchoLearnedTemplates(subject, predicate, mood, confidence)
    : buildShortLearnedTemplates(mood, confidence);
  return random.pick(pool);
}

export function formatDeniedLearnReply(
  random: RandomSource,
  subject: string,
  predicate: string,
  mood: Mood
): string {
  const pool = random.chance(0.25)
    ? buildEchoDeniedTemplates(subject, predicate, mood)
    : buildShortDeniedTemplates(mood);
  return random.pick(pool);
}

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
