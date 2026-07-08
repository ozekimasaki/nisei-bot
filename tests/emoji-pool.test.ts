import { describe, expect, test } from "vitest";
import { buildEmojiPool, defaultEmoji } from "../src/default-brain.js";
import { emojisForMood } from "../src/mood.js";

describe("buildEmojiPool", () => {
  test("defaultEmoji has at least 40 entries", () => {
    expect(defaultEmoji.length).toBeGreaterThanOrEqual(40);
  });

  test("merges learned, mood, and default emojis", () => {
    const pool = buildEmojiPool(["🎯"], "sleepy");
    expect(pool).toContain("🎯");
    expect(pool).toContain("😴");
    expect(pool).toContain("✨");
  });

  test("deduplicates overlapping emojis", () => {
    const pool = buildEmojiPool(["✨", "🌙"], "genki");
    const unique = new Set(pool);
    expect(unique.size).toBe(pool.length);
    expect(pool.filter((emoji) => emoji === "✨").length).toBe(1);
  });

  test("works without mood", () => {
    const pool = buildEmojiPool(["🎯"]);
    expect(pool).toContain("🎯");
    expect(pool).toContain("🍎");
    expect(pool).not.toContain("👑");
  });
});

describe("emojisForMood", () => {
  test("sleepy mood includes sleep-related emojis", () => {
    const sleepy = emojisForMood("sleepy");
    expect(sleepy).toContain("😴");
    expect(sleepy).toContain("💤");
  });

  test("normal mood has no dedicated emojis", () => {
    expect(emojisForMood("normal")).toEqual([]);
  });
});
