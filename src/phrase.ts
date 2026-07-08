import TinySegmenter from "tiny-segmenter";
import { findBestDictionaryMatch, findDictionaryMatches } from "./word-dictionary.js";

const noiseWords = new Set([
  "これ",
  "それ",
  "あれ",
  "ここ",
  "そこ",
  "ため",
  "よう",
  "こと",
  "もの",
  "さん",
  "ちゃん",
  "とても",
  "すごく",
  "まだ",
  "もう",
  "ちょっと",
  "しか",
  "だけ",
  "いつ",
  "こう",
  "そう",
  "こん",
  "そん",
  "あん",
  "どう",
  "めっちゃ",
  "結構",
  "けっこう",
  "なんか",
  "やっぱ",
  "たぶん",
  "する",
  "なる",
  "いる",
  "ある",
  "ない",
  "れる",
  "られる",
  "は",
  "が",
  "を",
  "に",
  "へ",
  "と",
  "で",
  "や",
  "も",
  "の"
]);

const segmenterParticles = new Set(["は", "が", "を", "に", "へ", "と", "で", "や", "も", "の", "から", "より"]);

export const MIN_MEMORY_WORD_LENGTH = 2;
export const MAX_MEMORY_WORD_LENGTH = 12;
export const LOW_CONFIDENCE_SCORE_THRESHOLD = 8;

const whitespaceSplitPattern = /(?:[\s　]+|から|より|の+)/u;
const boundedParticlePattern =
  /(?<=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])(?:は|が|を|に|へ|と|で|や|も)(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/gu;
const factSuffixPattern = /(?:じゃない(?:よ|ぞ)?|だよ|です|だ|なの|やで|だね)$/u;
const inflectionTailPattern =
  /(?:している|してる|してい|くて|した|ます|ません|ない|だった|でした|じゃない)$/u;
const teChainSplitPattern = /(?<=て)/u;

let cachedSegmenter: TinySegmenter | null = null;

export type NormalizeMemoryOptions = {
  hints?: string[];
  preferDictionary?: boolean;
  segmentFallback?: boolean;
};

export type MemoryWordConfidence = "high" | "low" | "none";

export type MemoryWordSource = "unchanged" | "rule" | "dictionary" | "segmenter";

export type ResolveMemoryWordResult = {
  word: string | null;
  confidence: MemoryWordConfidence;
  source: MemoryWordSource;
  score: number;
};

export function shouldLearnText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  if (/^https?:\/\//u.test(trimmed)) return false;
  if (/^<a?:\w+:\d+>$/u.test(trimmed)) return false;
  return true;
}

export function extractSnippets(text: string, options?: NormalizeMemoryOptions): string[] {
  return extractMemoryWordCandidates(text, options).slice(0, 3);
}

export function isValidMemoryWord(word: string): boolean {
  if (/^(.)\1{2,}$/u.test(word)) return false;
  return word.length >= MIN_MEMORY_WORD_LENGTH && word.length <= MAX_MEMORY_WORD_LENGTH && !noiseWords.has(word);
}

export function isLowConfidence(result: ResolveMemoryWordResult): boolean {
  if (!result.word) return true;
  if (result.confidence === "low") return true;
  if (result.confidence === "none") return true;
  return result.score < LOW_CONFIDENCE_SCORE_THRESHOLD;
}

export function resolveMemoryWord(text: string, options?: NormalizeMemoryOptions): ResolveMemoryWordResult {
  const stripped = stripForMemory(text);
  if (!stripped) {
    return { word: null, confidence: "none", source: "rule", score: 0 };
  }

  if (options?.preferDictionary) {
    const dictionaryWord = findBestDictionaryMatch(stripped);
    if (dictionaryWord && isValidMemoryWord(dictionaryWord)) {
      return {
        word: dictionaryWord,
        confidence: "high",
        source: "dictionary",
        score: 20
      };
    }
  }

  const ruleResult = resolveByRules(stripped, options);
  if (ruleResult.word && !isLowConfidence(ruleResult)) {
    return ruleResult;
  }

  if (options?.segmentFallback) {
    const segmentResult = resolveBySegmenter(stripped, options);
    if (segmentResult.word) return segmentResult;
  }

  return ruleResult;
}

export function normalizeMemoryWord(text: string, options?: NormalizeMemoryOptions): string | null {
  return resolveMemoryWord(text, options).word;
}

export function sanitizeFactPart(value: string, options?: NormalizeMemoryOptions): string {
  return normalizeMemoryWord(value, options) ?? "";
}

export function extractEmojis(text: string): string[] {
  const custom = text.match(/<a?:[A-Za-z0-9_~]+:\d{15,25}>/gu) ?? [];
  const unicode = text.match(/\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu) ?? [];
  return [...new Set([...custom, ...unicode])].slice(0, 8);
}

function stripForMemory(text: string): string {
  let stripped = text
    .replace(/[。.!！?？]+$/u, "")
    .replace(factSuffixPattern, "")
    .trim();
  if (!stripped) return "";

  stripped = stripped.replace(inflectionTailPattern, "").trim();
  stripped = stripLeadingAdverbs(stripped);
  return stripped;
}

function stripLeadingAdverbs(text: string): string {
  let current = text;
  const leadingAdverbPattern =
    /^(?:とても|すごく|めっちゃ|結構|けっこう|なんか|やっぱ|ちょっと|まだ|もう|きょうは|今日は|本当に)(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/u;

  while (leadingAdverbPattern.test(current)) {
    current = current.replace(leadingAdverbPattern, "").trim();
  }

  return current;
}

function resolveByRules(stripped: string, options?: NormalizeMemoryOptions): ResolveMemoryWordResult {
  const candidates = extractMemoryWordCandidates(stripped, options);
  const picked = pickMemoryWord(candidates, stripped, options);
  if (picked) {
    return {
      word: picked.word,
      confidence: picked.confidence,
      source: picked.source,
      score: picked.score
    };
  }

  if (isValidMemoryWord(stripped)) {
    const score = memoryWordScore(stripped, stripped, options);
    return {
      word: stripped,
      confidence: score >= LOW_CONFIDENCE_SCORE_THRESHOLD ? "high" : "low",
      source: "rule",
      score
    };
  }

  return { word: null, confidence: "none", source: "rule", score: 0 };
}

function resolveBySegmenter(stripped: string, options?: NormalizeMemoryOptions): ResolveMemoryWordResult {
  cachedSegmenter ??= new TinySegmenter();
  const segments = cachedSegmenter
    .segment(stripped)
    .map((segment) => segment.trim())
    .filter((segment) => isValidMemoryWord(segment) && !segmenterParticles.has(segment));

  const dictionaryMatches = findDictionaryMatches(stripped);
  const candidates = [...new Set([...dictionaryMatches, ...segments])].filter(isValidMemoryWord);
  const picked = pickMemoryWord(candidates, stripped, options);
  if (!picked) {
    return { word: null, confidence: "none", source: "segmenter", score: 0 };
  }

  return {
    word: picked.word,
    confidence: picked.confidence,
    source: "segmenter",
    score: picked.score
  };
}

function extractMemoryWordCandidates(text: string, options?: NormalizeMemoryOptions): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[<@!#&>\d]/gu, "")
    .replace(/[、。,.!?！？()[\]{}「」『』"']/gu, " ")
    .trim();

  const segments = splitSegments(cleaned);
  const dictionaryMatches = findDictionaryMatches(cleaned);

  const candidates = segments.flatMap((segment) => {
    const extras = [
      ...extractKanjiWords(segment),
      ...extractNoSegments(segment),
      ...extractLatinWords(segment),
      ...extractKatakanaWords(segment)
    ];
    if (/[\u4E00-\u9FFF々][ぁ-ん]/u.test(segment)) return extras;
    return [segment, ...extras];
  });

  const hintMatches = (options?.hints ?? []).filter((hint) => cleaned.includes(hint) && isValidMemoryWord(hint));

  return [...new Set([...hintMatches, ...dictionaryMatches, ...candidates])].filter(isValidMemoryWord);
}

function splitSegments(text: string): string[] {
  const splitByParticles = text
    .split(boundedParticlePattern)
    .flatMap((segment) => segment.split(whitespaceSplitPattern))
    .flatMap((segment) => segment.split(teChainSplitPattern))
    .map((segment) => segment.trim())
    .filter(Boolean);

  return splitByParticles;
}

function extractLatinWords(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9_-]{0,11}/gu) ?? []).filter(isValidMemoryWord);
}

function extractKatakanaWords(text: string): string[] {
  return (text.match(/[ァ-ヴー]{2,12}/gu) ?? []).filter(isValidMemoryWord);
}

function extractKanjiWords(text: string): string[] {
  const blocks = text.match(/[\u4E00-\u9FFF々]+/gu) ?? [];
  const words: string[] = [];

  for (const block of blocks) {
    if (block.length === 2 && isValidMemoryWord(block)) {
      words.push(block);
      continue;
    }

    for (let size = 2; size <= Math.min(4, block.length); size++) {
      for (let index = 0; index <= block.length - size; index++) {
        const word = block.slice(index, index + size);
        if (isValidMemoryWord(word)) words.push(word);
      }
    }
  }

  return words;
}

function extractNoSegments(text: string): string[] {
  const parts = text
    .split(/の+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const words = parts.filter(isValidMemoryWord);
  if (parts.length < 2) return words;

  const tail = parts[parts.length - 1]!;
  const tailSegments = splitSegments(tail);

  return [...words, ...tailSegments.filter(isValidMemoryWord), ...extractKanjiWords(tail)].filter(isValidMemoryWord);
}

function pickMemoryWord(
  candidates: string[],
  sourceText: string,
  options?: NormalizeMemoryOptions
): { word: string; confidence: MemoryWordConfidence; source: MemoryWordSource; score: number } | null {
  const unique = [...new Set(candidates)].filter(isValidMemoryWord);
  if (unique.length === 0) return null;

  const hinted = unique.filter((word) => options?.hints?.includes(word));
  const pool = hinted.length > 0 ? hinted : unique;

  const scored = pool.map((word) => ({
    word,
    score: memoryWordScore(word, sourceText, options)
  }));
  const maxScore = Math.max(...scored.map((item) => item.score));
  const top = scored.filter((item) => item.score === maxScore);
  top.sort((left, right) => left.word.length - right.word.length);

  const picked = top[0]!;
  const confidence = classifyConfidence(picked.word, picked.score, options);
  return {
    word: picked.word.slice(0, MAX_MEMORY_WORD_LENGTH),
    confidence,
    source: "rule",
    score: picked.score
  };
}

function classifyConfidence(
  word: string,
  score: number,
  options?: NormalizeMemoryOptions
): MemoryWordConfidence {
  if (!word) return "none";
  if (/^(.)\1{2,}$/u.test(word)) return "low";
  if (score >= LOW_CONFIDENCE_SCORE_THRESHOLD) return "high";
  if (options?.hints?.includes(word)) return "high";
  if (/^[ぁ-んー]{1,3}$/u.test(word)) return "low";
  if (!/[\u4E00-\u9FFF]/u.test(word) && !/^[A-Za-z]/u.test(word) && !/^[ァ-ヴー]+$/u.test(word)) {
    return "low";
  }
  return score > 0 ? "low" : "none";
}

function memoryWordScore(word: string, sourceText: string, options?: NormalizeMemoryOptions): number {
  let score = 0;
  if (/^(.)\1{2,}$/u.test(word)) score -= 8;
  if (/^[A-Za-z][A-Za-z0-9_-]*$/u.test(word)) score += 12;
  else if (/^[\u4E00-\u9FFF]+$/u.test(word)) score += 10;
  else if (/[\u4E00-\u9FFF]/u.test(word)) score += 4;
  else if (/^[ァ-ヴー]+$/u.test(word)) score += 3;
  else if (/^[ぁ-んー]+$/u.test(word)) score += 1;

  if (sourceText.includes(word)) score += 2;
  const noTail = sourceText.split(/の/u).at(-1) ?? "";
  if (noTail.includes(word)) score += 8;
  if (sourceText.includes("の") && word === sourceText.split(/の/u).at(-1)?.slice(0, word.length)) {
    score += 4;
  }
  if (options?.hints?.includes(word)) score += 10;
  if (findDictionaryMatches(sourceText).includes(word)) score += 4;
  const kanjiCandidates = sourceText.match(/[\u4E00-\u9FFF]{2,4}/gu) ?? [];
  if (/^[A-Za-z]/u.test(word) && kanjiCandidates.length > 0) {
    const index = sourceText.lastIndexOf(word);
    if (index >= 0 && index + word.length >= sourceText.length - 1) {
      score -= 5;
    }
  }
  if (/[てで]$/.test(word)) score -= 3;
  if (/いる$/.test(word)) score -= 4;
  if (word.length <= 4) score += 2;
  if (word.length > 6) score -= 2;
  return score;
}
