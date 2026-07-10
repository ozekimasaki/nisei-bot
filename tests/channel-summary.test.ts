import { describe, expect, it, vi } from "vitest";
import {
  buildShortenPrompt,
  buildSummaryFooter,
  buildSummaryPrompt,
  clampEmbedTitle,
  clampToEmbedDescription,
  EMBED_DESCRIPTION_LIMIT,
  EMBED_TITLE_LIMIT,
  formatTranscript,
  MAX_SHORTEN_RETRIES,
  needsShortenRetry,
  OUTPUT_CUT_SUFFIX,
  SOFT_OUTPUT_LIMIT,
  summarizeChannelDay,
  trimTranscript,
  type TranscriptMessage
} from "../src/channel-summary.js";

describe("formatTranscript", () => {
  it("formats author and content lines", () => {
    const messages: TranscriptMessage[] = [
      {
        authorName: "太郎",
        content: "こんにちは",
        createdTimestamp: 1,
        bot: false
      },
      {
        authorName: "にせい",
        content: "はい",
        createdTimestamp: 2,
        bot: true
      }
    ];
    expect(formatTranscript(messages)).toEqual(["太郎: こんにちは", "にせい: はい"]);
  });

  it("skips empty content", () => {
    expect(
      formatTranscript([
        { authorName: "x", content: "  ", createdTimestamp: 1, bot: false }
      ])
    ).toEqual([]);
  });
});

describe("trimTranscript", () => {
  it("keeps newer lines when over char limit", () => {
    const lines = ["old: aaaaa", "mid: bbbbb", "new: ccccc"];
    const result = trimTranscript(lines, 20);
    expect(result.truncatedInput).toBe(true);
    expect(result.transcript).not.toContain("old:");
    expect(result.transcript).toContain("new:");
  });

  it("does not truncate when under limit", () => {
    const result = trimTranscript(["a: hi", "b: yo"], 1000);
    expect(result.truncatedInput).toBe(false);
    expect(result.transcript).toBe("a: hi\nb: yo");
  });
});

describe("buildSummaryPrompt", () => {
  it("includes soft limit and nisei style instructions", () => {
    const prompt = buildSummaryPrompt("a: hi", { truncatedInput: false });
    expect(prompt).toContain(String(SOFT_OUTPUT_LIMIT));
    expect(prompt).toContain("にせい");
    expect(prompt).toContain("【構成】");
    expect(prompt).toContain("【よい例（この感じで書く）】");
    expect(prompt).toContain("呼び捨て");
    expect(prompt).toContain("絵文字");
    expect(prompt).toContain("a: hi");
    expect(prompt).not.toContain("ログは一部のみ");
  });

  it("notes partial logs when truncated", () => {
    const prompt = buildSummaryPrompt("a: hi", { truncatedInput: true });
    expect(prompt).toContain("ログは一部のみ");
  });
});

describe("buildShortenPrompt", () => {
  it("asks to rewrite within soft limit keeping block structure", () => {
    const prompt = buildShortenPrompt("ながいまとめ");
    expect(prompt).toContain(String(SOFT_OUTPUT_LIMIT));
    expect(prompt).toContain("ながいまとめ");
    expect(prompt).toContain("話題ブロック");
  });
});

describe("needsShortenRetry", () => {
  it("detects over soft limit", () => {
    expect(needsShortenRetry("a".repeat(SOFT_OUTPUT_LIMIT))).toBe(false);
    expect(needsShortenRetry("a".repeat(SOFT_OUTPUT_LIMIT + 1))).toBe(true);
  });
});

describe("clampToEmbedDescription", () => {
  it("passes through short text", () => {
    const result = clampToEmbedDescription("短い");
    expect(result).toEqual({ text: "短い", truncatedOutput: false });
  });

  it("hard-cuts with suffix within embed limit", () => {
    const result = clampToEmbedDescription("あ".repeat(SOFT_OUTPUT_LIMIT + 100));
    expect(result.truncatedOutput).toBe(true);
    expect(result.text.endsWith(OUTPUT_CUT_SUFFIX)).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
  });

  it("fits suffix when input exceeds hard limit", () => {
    const result = clampToEmbedDescription("あ".repeat(EMBED_DESCRIPTION_LIMIT + 500));
    expect(result.truncatedOutput).toBe(true);
    expect(result.text.length).toBe(EMBED_DESCRIPTION_LIMIT);
    expect(result.text.endsWith(OUTPUT_CUT_SUFFIX)).toBe(true);
  });
});

describe("buildSummaryFooter", () => {
  it("builds footer combinations", () => {
    expect(buildSummaryFooter({ truncatedInput: false, truncatedOutput: false })).toBe(
      "直近24時間"
    );
    expect(buildSummaryFooter({ truncatedInput: true, truncatedOutput: false })).toBe(
      "直近24時間・一部のみ"
    );
    expect(buildSummaryFooter({ truncatedInput: false, truncatedOutput: true })).toBe(
      "直近24時間・要約カット"
    );
    expect(buildSummaryFooter({ truncatedInput: true, truncatedOutput: true })).toBe(
      "直近24時間・一部のみ・要約カット"
    );
  });
});

describe("clampEmbedTitle", () => {
  it("clamps long titles", () => {
    const long = "x".repeat(EMBED_TITLE_LIMIT + 10);
    expect(clampEmbedTitle(long).length).toBe(EMBED_TITLE_LIMIT);
  });
});

describe("summarizeChannelDay", () => {
  it("returns first response when under soft limit", async () => {
    const generateContent = vi.fn(async () => "短いまとめ");
    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript: "a: hi",
      truncatedInput: false,
      generateContent
    });
    expect(result).toEqual({ text: "短いまとめ", truncatedOutput: false });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("retries shorten up to 3 times then hard-cuts", async () => {
    const long = "あ".repeat(SOFT_OUTPUT_LIMIT + 50);
    const generateContent = vi.fn(async () => long);
    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript: "a: hi",
      truncatedInput: false,
      generateContent
    });
    expect(generateContent).toHaveBeenCalledTimes(1 + MAX_SHORTEN_RETRIES);
    expect(result.truncatedOutput).toBe(true);
    expect(result.text.endsWith(OUTPUT_CUT_SUFFIX)).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
  });

  it("stops retrying once shortened enough", async () => {
    const long = "あ".repeat(SOFT_OUTPUT_LIMIT + 10);
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce("短くした");
    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript: "a: hi",
      truncatedInput: false,
      generateContent
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ text: "短くした", truncatedOutput: false });
  });

  it("throws on empty response", async () => {
    await expect(
      summarizeChannelDay({
        apiKey: "test",
        model: "gemini-3.5-flash",
        thinkingLevel: "medium",
        transcript: "a: hi",
        truncatedInput: false,
        generateContent: async () => ""
      })
    ).rejects.toThrow("empty_gemini_response");
  });
});
