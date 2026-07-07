import { describe, expect, test } from "vitest";
import { HaikuGenerator, MoraEstimator } from "../src/haiku.js";
import { SeededRandomSource } from "../src/random.js";

describe("MoraEstimator", () => {
  const estimator = new MoraEstimator();

  test("counts kana-like mora roughly", () => {
    expect(estimator.estimate("おはよう")).toBe(4);
    expect(estimator.estimate("きょう")).toBe(2);
    expect(estimator.estimate("にっぽん")).toBe(4);
  });

  test("guesses kanji and latin blocks roughly", () => {
    expect(estimator.estimate("春")).toBe(2);
    expect(estimator.estimate("bot")).toBe(3);
  });
});

describe("HaikuGenerator", () => {
  test("generates non-empty haiku-like text", () => {
    const generator = new HaikuGenerator(new SeededRandomSource(3));
    const result = generator.generate(
      [{ subject: "りんご", predicate: "赤い", confidence: 1 }],
      ["おやすみ"]
    );
    expect(result.split("\n")).toHaveLength(3);
    expect(result.replace(/\s/g, "").length).toBeGreaterThan(0);
  });
});
