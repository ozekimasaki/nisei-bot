import { describe, expect, it, vi } from "vitest";
import {
  applyImageLabels,
  buildChunkSummaryPrompt,
  buildMergeSummaryPrompt,
  buildPaginatePrompt,
  buildShortenPrompt,
  buildSummaryFooter,
  buildSummaryPrompt,
  buildTranscriptChunks,
  chunkTranscript,
  clampEmbedTitle,
  clampToEmbedDescription,
  countImageLabels,
  EMBED_DESCRIPTION_LIMIT,
  EMBED_TITLE_LIMIT,
  formatTranscript,
  imagesForTranscript,
  isValidPagedSummary,
  loadSummaryImages,
  MAX_IMAGES_PER_CHUNK,
  MAX_SHORTEN_RETRIES,
  MAX_SUMMARY_IMAGES,
  needsShortenRetry,
  OUTPUT_CUT_SUFFIX,
  PAGE_CHAR_LIMIT,
  PAGE_MARKER,
  paginateSummaryFallback,
  parsePagedSummary,
  resolveImageMime,
  selectImagesForTranscript,
  SOFT_OUTPUT_LIMIT,
  splitChunkByImageLimit,
  summarizeChannelDay,
  trimTranscript,
  type TranscriptMessage
} from "../src/channel-summary.js";
import {
  advanceSummaryPage,
  deleteSummaryPageSession,
  getSummaryPageSession,
  saveSummaryPageSession
} from "../src/summary-page-store.js";

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
  it("labels all images without dropping older ones", () => {
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
    expect(result.truncatedImages).toBe(false);
    expect(result.pending).toHaveLength(MAX_SUMMARY_IMAGES + 2);
    expect(result.messages).toHaveLength(MAX_SUMMARY_IMAGES + 2);
    expect(result.pending[0]?.label).toBe("画像1");
    expect(result.pending[0]?.url).toBe("https://example.com/0.png");
    expect(result.messages[0]?.content).toBe("[画像1]");
    expect(result.messages.at(-1)?.content).toBe(`[画像${MAX_SUMMARY_IMAGES + 2}]`);
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

describe("chunkTranscript", () => {
  it("keeps chronological order under max chars", () => {
    const lines = ["a: one", "b: two", "c: three"];
    expect(chunkTranscript(lines, 1000)).toEqual(["a: one\nb: two\nc: three"]);
    const pages = chunkTranscript(lines, 10);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("\n")).toBe(lines.join("\n"));
  });
});

describe("splitChunkByImageLimit", () => {
  it("splits when too many image labels", () => {
    const lines = Array.from({ length: MAX_IMAGES_PER_CHUNK + 2 }, (_, i) => `u: [画像${i + 1}]`);
    const parts = splitChunkByImageLimit(lines.join("\n"));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => countImageLabels(part) <= MAX_IMAGES_PER_CHUNK)).toBe(true);
  });
});

describe("buildTranscriptChunks", () => {
  it("returns one chunk for short transcript", () => {
    expect(buildTranscriptChunks("a: hi\nb: yo")).toEqual(["a: hi\nb: yo"]);
  });
});

describe("imagesForTranscript", () => {
  it("filters images by label presence", () => {
    const images = [
      { label: "画像1", mimeType: "image/png", base64: "a" },
      { label: "画像2", mimeType: "image/png", base64: "b" }
    ];
    expect(imagesForTranscript("x: [画像2]", images)).toEqual([images[1]]);
  });
});

describe("buildChunkSummaryPrompt", () => {
  it("marks partial day context", () => {
    const prompt = buildChunkSummaryPrompt("a: hi", {
      partIndex: 2,
      partCount: 3,
      imageCount: 0
    });
    expect(prompt).toContain("パート 2/3");
    expect(prompt).toContain("最終まとめではない");
  });
});

describe("buildMergeSummaryPrompt", () => {
  it("includes style rules and parts", () => {
    const prompt = buildMergeSummaryPrompt(["メモ1", "メモ2"]);
    expect(prompt).toContain("【パート1】");
    expect(prompt).toContain("メモ2");
    expect(prompt).toContain("【構成】");
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
    expect(
      buildSummaryFooter({ truncatedInput: false, pageIndex: 1, pageCount: 3 })
    ).toBe("直近24時間・2/3");
  });
});

describe("parsePagedSummary", () => {
  it("splits on page marker", () => {
    expect(parsePagedSummary(`一ページ\n${PAGE_MARKER}\n二ページ`)).toEqual([
      "一ページ",
      "二ページ"
    ]);
  });
});

describe("isValidPagedSummary", () => {
  it("rejects single page or oversized pages", () => {
    expect(isValidPagedSummary(["only"])).toBe(false);
    expect(isValidPagedSummary(["a", "b"])).toBe(true);
    expect(isValidPagedSummary(["あ".repeat(PAGE_CHAR_LIMIT + 1), "b"])).toBe(false);
  });
});

describe("paginateSummaryFallback", () => {
  it("keeps short text as one page", () => {
    expect(paginateSummaryFallback("短い")).toEqual(["短い"]);
  });

  it("splits on blank lines within limit", () => {
    const block = "あ".repeat(100);
    const text = `${block}\n\n${block}\n\n${block}`;
    const pages = paginateSummaryFallback(text, 150);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length <= 150)).toBe(true);
  });

  it("hard-splits oversized blocks", () => {
    const pages = paginateSummaryFallback("あ".repeat(PAGE_CHAR_LIMIT + 50), PAGE_CHAR_LIMIT);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length <= PAGE_CHAR_LIMIT)).toBe(true);
  });
});

describe("buildPaginatePrompt", () => {
  it("includes marker and limits", () => {
    const prompt = buildPaginatePrompt("ながいまとめ");
    expect(prompt).toContain(PAGE_MARKER);
    expect(prompt).toContain(String(PAGE_CHAR_LIMIT));
    expect(prompt).toContain("ながいまとめ");
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
    expect(result).toEqual({
      text: "短いまとめ",
      pages: ["短いまとめ"],
      truncatedOutput: false
    });
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
    expect(result).toEqual({
      text: "短くした",
      pages: ["短くした"],
      truncatedOutput: false
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0]?.[1]).toEqual(images);
    expect(generateContent.mock.calls[1]?.[1]).toBeUndefined();
  });

  it("retries shorten then paginates with Gemini", async () => {
    const long = "あ".repeat(SOFT_OUTPUT_LIMIT + 50);
    const page1 = "一ページめ";
    const page2 = "二ページめ";
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce(long)
      .mockResolvedValueOnce(`${page1}\n${PAGE_MARKER}\n${page2}`);
    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript: "a: hi",
      truncatedInput: false,
      generateContent
    });
    expect(generateContent).toHaveBeenCalledTimes(1 + MAX_SHORTEN_RETRIES + 1);
    expect(result.pages).toEqual([page1, page2]);
    expect(result.text).toBe(page1);
    expect(result.truncatedOutput).toBe(false);
    expect(generateContent.mock.calls.at(-1)?.[0]).toContain(PAGE_MARKER);
  });

  it("falls back to mechanical pages when Gemini split is invalid", async () => {
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
    expect(generateContent).toHaveBeenCalledTimes(1 + MAX_SHORTEN_RETRIES + 1);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.every((page) => page.length <= PAGE_CHAR_LIMIT)).toBe(true);
    expect(result.text).toBe(result.pages[0]);
    expect(result.truncatedOutput).toBe(false);
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
    expect(result).toEqual({
      text: "短くした",
      pages: ["短くした"],
      truncatedOutput: false
    });
  });

  it("uses map-reduce when transcript needs multiple chunks", async () => {
    const line = `user: ${"あ".repeat(2000)}`;
    const transcript = Array.from({ length: 40 }, () => line).join("\n");
    expect(buildTranscriptChunks(transcript).length).toBeGreaterThan(1);

    const generateContent = vi.fn(async (prompt: string) => {
      if (prompt.includes("最終まとめではない")) return "中間メモ";
      if (prompt.includes("中間まとめ")) return "最終まとめ";
      return "短いまとめ";
    });

    const result = await summarizeChannelDay({
      apiKey: "test",
      model: "gemini-3.5-flash",
      thinkingLevel: "medium",
      transcript,
      truncatedInput: false,
      generateContent
    });

    expect(result.text).toBe("最終まとめ");
    expect(result.pages).toEqual(["最終まとめ"]);
    expect(generateContent.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(
      generateContent.mock.calls.filter(([prompt]) =>
        String(prompt).includes("最終まとめではない")
      ).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      generateContent.mock.calls.some(([prompt]) => String(prompt).includes("中間まとめ"))
    ).toBe(true);
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

describe("summary page store", () => {
  it("advances pages for the saved session", () => {
    saveSummaryPageSession("msg1", {
      userId: "u1",
      channelName: "general",
      truncatedInput: false,
      pages: ["p1", "p2", "p3"],
      pageIndex: 0
    });
    expect(getSummaryPageSession("msg1")?.pageIndex).toBe(0);
    expect(advanceSummaryPage("msg1")?.pageIndex).toBe(1);
    expect(advanceSummaryPage("msg1")?.pageIndex).toBe(2);
    deleteSummaryPageSession("msg1");
    expect(getSummaryPageSession("msg1")).toBeNull();
  });
});
