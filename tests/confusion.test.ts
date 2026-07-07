import { describe, expect, test } from "vitest";
import { ConfusionEngine } from "../src/confusion.js";
import { SeededRandomSource } from "../src/random.js";

describe("ConfusionEngine", () => {
  test("returns metadata when it confuses a missing fact with another fact", () => {
    const confusion = new ConfusionEngine(new SeededRandomSource(1), 1, 1);
    const answer = confusion.answerFact("りんご", null, [
      { subject: "ばなな", predicate: "黄色", confidence: 1 }
    ]);

    expect(answer.text).toContain("りんご");
    expect(answer.misunderstanding).toEqual({
      subject: "りんご",
      wrongPredicate: "黄色",
      sourcePredicate: "ばなな"
    });
  });
});
