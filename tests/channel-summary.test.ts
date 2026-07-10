import { describe, expect, it, vi } from "vitest";
import {
  applyImageLabels,
  buildShortenPrompt,
  buildSummaryFooter,
  buildSummaryPrompt,
  clampEmbedTitle,
  clampToEmbedDescription,
  EMBED_DESCRIPTION_LIMIT,
  EMBED_TITLE_LIMIT,
  formatTranscript,
  loadSummaryImages,
  MAX_SHORTEN_RETRIES,
  MAX_SUMMARY_IMAGES,
  needsShortenRetry,
  OUTPUT_CUT_SUFFIX,
  resolveImageMime,
  selectImagesForTranscript,
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

describe("resolveImageMime", () => {
  it("resolves from content type or filename", () => {
    expect(
      resolveImageMime({
        contentType: "image/png",
        name: "a.bin",
        size: 10,
        url: "https://example.com/a"
      } as never)
    ).toBe("image/png");
    expect(
      resolveImageMime({
        contentType: null,
        name: "cat.WEBP",
        size: 10,
        url: "https://example.com/a"
      } as never)
    ).toBe("image/webp");
    expect(
      resolveImageMime({
        contentType: "application/pdf",
        name: "doc.pdf",
        size: 10,
        url: "https://example.com/a"
      } as never)
    ).toBeNull();
  });
});

describe("applyImageLabels", () => {
  it("labels newest images first when over max", () => {
    const messages: TranscriptMessage[] = Array.from({ length: MAX_SUMMARY_IMAGES + 2 }, (_, i) => ({
      authorName: `u${i}`,
      content: "",
      createdTimestamp: i + 1,
      bot: false,
      images: [
        {
          url: `https://example.com/${i}.png`,
          mimeType: "image/png",
          size: 100
        }
      ]
    }));

    const result = applyImageLabels(messages);
    expect(result.truncatedImages).toBe(true);
    expect(result.pending).toHaveLength(MAX_SUMMARY_IMAGES);
    expect(result.messages).toHaveLength(MAX_SUMMARY_IMAGES);
    expect(result.pending[0]?.label).toBe("画像1");
    expect(result.pending[0]?.url).toBe("https://example.com/2.png");
    expect(result.messages[0]?.content).toBe("[画像1]");
    expect(result.messages.at(-1)?.content).toBe(`[画像${MAX_SUMMARY_IMAGES}]`);
  });
});

describe("selectImagesForTranscript", () => {
  it("keeps only images referenced in transcript", () => {
    const pending = [
      { label: "画像1", url: "https://a", mimeType: "image/png", size: 1 },
      { label: "画像2", url: "https://b", mimeType: "image/png", size: 1 }
    ];
    expect(selectImagesForTranscript("太郎: [画像2] みた", pending)).toEqual([pending[1]]);
  });
});

describe("loadSummaryImages", () => {
  it("loads base64 from fetch", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(Buffer.from("hello"), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
    );
    const loaded = await loadSummaryImages(
      [{ label: "画像1", url: "https://example.com/a.png", mimeType: "image/png", size: 5 }],
      fetchImpl as unknown as typeof fetch
    );
    expect(loaded).toEqual([
      {
        label: "画像1",
        mimeType: "image/png",
        base64: Buffer.from("hello").toString("base64")
      }
    ]);
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
    const prompt = buildSummaryPrompt("a: hi", { truncatedInput: false, imageCount: 0 });
    expect(prompt).toContain(String(SOFT_OUTPUT_LIMIT));
    expect(prompt).toContain("にせい");
    expect(prompt).toContain("【構成】");
    expect(prompt).toContain("【よい例（この感じで書く）】");
    expect(prompt).toContain("呼び捨て");
    expect(prompt).toContain("絵文字");
    expect(prompt).toContain("a: hi");
    expect(prompt).not.toContain("ログは一部のみ");
    expect(prompt).not.toContain("【画像】");
  });

  it("notes images when present", () => {
    const prompt = buildSummaryPrompt("a: [画像1]", {
      truncatedInput: false,
      imageCount: 2
    });
    expect(prompt).toContain("【画像】");
    expect(prompt).toContain("2 枚");
  });

  it("notes partial logs when truncated", () => {
    const prompt = buildSummaryPrompt("a: hi", { truncatedInput: true, imageCount: 0 });
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

  it("sends images only on the first call", async () => {
    const long = "あ".repeat(SOFT_OUTPUT_LIMIT + 10);
    const images = [{ label: "画像1", mimeType: "image/png", base64: "aaaa" }];
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce("短くした");
    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript: "a: [画像1]",
      truncatedInput: false,
      images,
      generateContent
    });
    expect(result).toEqual({ text: "短くした", truncatedOutput: false });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0]?.[1]).toEqual(images);
    expect(generateContent.mock.calls[1]?.[1]).toBeUndefined();
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
