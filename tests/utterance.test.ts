import { describe, expect, test } from "vitest";
import { SeededRandomSource } from "../src/random.js";
import {
  confusedAboutSubject,
  formatFactAnswer,
  withMaybeOpener
} from "../src/utterance.js";

describe("utterance helpers", () => {
  test("confusedAboutSubject never says it does not know", () => {
    const random = new SeededRandomSource(42);
    for (let seed = 0; seed < 20; seed += 1) {
      const answer = confusedAboutSubject(new SeededRandomSource(seed), "りんご");
      expect(answer).not.toMatch(/しらない|知らない/u);
    }
    const focused = confusedAboutSubject(new SeededRandomSource(1), "りんご");
    expect(focused).toContain("りんご");
    expect(confusedAboutSubject(random, "りんご", ["黄色"])).toBeTruthy();
  });

  test("formatFactAnswer varies known-fact phrasing", () => {
    const random = new SeededRandomSource(3);
    const answer = formatFactAnswer(random, "りんご", "赤い");
    expect(answer).toMatch(/りんご/u);
    expect(answer).toMatch(/赤い/u);
  });

  test("withMaybeOpener can leave body unchanged", () => {
    const random = new SeededRandomSource(99);
    expect(withMaybeOpener(random, "おはよ", 0)).toBe("おはよ");
  });

  test("withMaybeOpener can prepend an opener", () => {
    const random = new SeededRandomSource(7);
    const answer = withMaybeOpener(random, "おはよ", 1);
    expect(answer.endsWith("おはよ")).toBe(true);
  });
});
