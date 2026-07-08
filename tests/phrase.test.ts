import { describe, expect, test } from "vitest";
import {
  extractSnippets,
  isLowConfidence,
  normalizeMemoryWord,
  resolveMemoryWord,
  sanitizeFactPart
} from "../src/phrase.js";

describe("normalizeMemoryWord", () => {
  test("keeps short words as-is", () => {
    expect(normalizeMemoryWord("りんご")).toBe("りんご");
    expect(normalizeMemoryWord("赤い")).toBe("赤い");
  });

  test("extracts a single word from long teaching predicates", () => {
    expect(normalizeMemoryWord("とても楽しくて毎日続けている")).toBe("毎日");
    expect(normalizeMemoryWord("日本の首都で人口が多い都市")).toBe("首都");
  });

  test("strips teaching suffixes before extraction", () => {
    expect(normalizeMemoryWord("おいしいだよ")).toBe("おいしい");
    expect(normalizeMemoryWord("赤いじゃないよ")).toBe("赤い");
  });

  test("removes adverbs like めっちゃ", () => {
    expect(normalizeMemoryWord("めっちゃ眠い")).toBe("眠い");
  });

  test("extracts latin words", () => {
    expect(normalizeMemoryWord("Discordは便利")).toBe("Discord");
  });

  test("uses dictionary matches", () => {
    expect(normalizeMemoryWord("たこ焼きはうまい", { preferDictionary: true })).toBe("たこ焼き");
  });

  test("rejects overly long undivided text", () => {
    expect(normalizeMemoryWord("とても楽しくて毎日続けている")).not.toBe("とても楽しくて毎日続けている");
  });
});

describe("resolveMemoryWord", () => {
  test("marks repeated vowel noise as low confidence or null", () => {
    const result = resolveMemoryWord("ああああ");
    expect(result.word === null || isLowConfidence(result)).toBe(true);
  });

  test("boosts hinted words", () => {
    const result = resolveMemoryWord("きょうはねむい", { hints: ["ねむい"] });
    expect(result.word).toBe("ねむい");
  });
});

describe("extractSnippets", () => {
  test("splits on particles including の", () => {
    expect(extractSnippets("りんごの味は甘い")).toEqual(expect.arrayContaining(["りんご", "甘い"]));
  });

  test("does not keep long phrases", () => {
    const snippets = extractSnippets("とても楽しくて毎日続けている");
    expect(snippets.every((snippet) => snippet.length <= 12)).toBe(true);
    expect(snippets).not.toContain("とても楽しくて毎日続けている");
  });
});

describe("sanitizeFactPart", () => {
  test("returns a single memory word", () => {
    expect(sanitizeFactPart("とても賢くてみんなのことを覚えるのが得意なbot")).toBe("得意");
  });
});
