import { describe, expect, test } from "vitest";
import { MoodEngine, parseMood } from "../src/mood.js";
import { SeededRandomSource } from "../src/random.js";

describe("MoodEngine", () => {
  test("persists previous mood", () => {
    const random = new SeededRandomSource(99);
    const engine = new MoodEngine(random, 1);
    expect(engine.nextMood("こんにちは", "sleepy")).toBe("sleepy");
  });

  test("parses stored mood", () => {
    expect(parseMood("genki")).toBe("genki");
    expect(parseMood("invalid")).toBeNull();
  });
});
