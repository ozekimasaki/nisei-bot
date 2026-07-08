import { describe, expect, test } from "vitest";
import { MoodEngine, parseMood } from "../src/mood.js";
import type { RandomSource } from "../src/random.js";
import { SeededRandomSource } from "../src/random.js";

function mockRandom(value: number): RandomSource {
  return {
    next: () => value,
    pick: <T>(items: readonly T[]) => items[0]!,
    chance: (probability) => value < probability,
    int: (min) => min
  };
}

describe("MoodEngine", () => {
  test("persists previous mood", () => {
    const random = new SeededRandomSource(99);
    const engine = new MoodEngine(random, 1);
    expect(engine.nextMood("こんにちは", "genki")).toBe("genki");
  });

  test("wake keywords override sleepy mood", () => {
    const random = new SeededRandomSource(99);
    const engine = new MoodEngine(random, 1);
    expect(engine.nextMood("にせい起きて", "sleepy")).toMatch(/^(genki|normal)$/);
  });

  test("wake keywords prefer genki over normal", () => {
    const random = new SeededRandomSource(42);
    const engine = new MoodEngine(random, 1);
    expect(engine.nextMood("おはよう", "sleepy")).toBe("genki");
  });

  test("sleepy mood has lower persist rate than other moods", () => {
    const engine = new MoodEngine(mockRandom(0.3), 0.65);
    expect(engine.nextMood("こんにちは", "genki")).toBe("genki");
    expect(engine.nextMood("こんにちは", "sleepy")).toBe("normal");
  });

  test("escaping sleepy without sleep keywords biases toward normal or genki", () => {
    let sleepyCount = 0;
    let awakeCount = 0;
    for (let seed = 0; seed < 200; seed++) {
      const random = new SeededRandomSource(seed);
      const engine = new MoodEngine(random, 0);
      const mood = engine.nextMood("こんにちは", "sleepy");
      if (mood === "sleepy") sleepyCount++;
      if (mood === "normal" || mood === "genki") awakeCount++;
    }
    expect(awakeCount).toBeGreaterThan(sleepyCount);
  });

  test("wake keywords take priority over sleep keywords", () => {
    const random = new SeededRandomSource(99);
    const engine = new MoodEngine(random, 1);
    expect(engine.nextMood("ねむいけど起きて", "sleepy")).toMatch(/^(genki|normal)$/);
  });

  test("parses stored mood", () => {
    expect(parseMood("genki")).toBe("genki");
    expect(parseMood("invalid")).toBeNull();
  });
});
