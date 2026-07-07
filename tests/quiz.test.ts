import { describe, expect, test } from "vitest";
import { buildMemoryQuiz } from "../src/quiz.js";
import { SeededRandomSource } from "../src/random.js";

describe("buildMemoryQuiz", () => {
  test("includes one lie among facts", () => {
    const random = new SeededRandomSource(42);
    const quiz = buildMemoryQuiz(
      random,
      [
        { subject: "りんご", predicate: "赤い", confidence: 1 },
        { subject: "バナナ", predicate: "黄色", confidence: 1 },
        { subject: "ぶどう", predicate: "紫", confidence: 1 }
      ],
      ["スプーン"]
    );
    expect(quiz).not.toBeNull();
    expect(quiz!.items).toHaveLength(3);
    expect(quiz!.items.filter((item) => item.isLie)).toHaveLength(1);
    expect(quiz!.text).toContain("どれがうそ");
  });

  test("returns null with too few facts", () => {
    const random = new SeededRandomSource(1);
    const quiz = buildMemoryQuiz(random, [{ subject: "りんご", predicate: "赤い", confidence: 1 }], []);
    expect(quiz).toBeNull();
  });
});
