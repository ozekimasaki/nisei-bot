import { describe, expect, test } from "vitest";
import { SeededRandomSource } from "../src/random.js";
import {
  confusedAboutSubject,
  formatDeniedLearnReply,
  formatFactAnswer,
  formatLearnedReply,
  withMaybeOpener,
  withQuestionOpener
} from "../src/utterance.js";

function hasEcho(answer: string, subject: string, predicate: string): boolean {
  return answer.includes(subject) && answer.includes(predicate);
}

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

  test("withQuestionOpener starts with a cute はい variant", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const random = new SeededRandomSource(seed);
      const answer = withQuestionOpener(random, "りんごは赤い");
      expect(answer).toMatch(/^はい/u);
      expect(answer).toContain("りんご");
    }
  });

  test("withQuestionOpener replaces generic openers", () => {
    const random = new SeededRandomSource(3);
    const answer = withQuestionOpener(random, "うん\nりんごは赤い");
    expect(answer).toMatch(/^はい/u);
    expect(answer).toContain("りんごは赤い");
    expect(answer).not.toMatch(/^うん/u);
  });

  test("formatLearnedReply often returns short reactions without echoing words", () => {
    let sawShort = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const answer = formatLearnedReply(new SeededRandomSource(seed), "りんご", "赤い", "normal", 1);
      if (!hasEcho(answer, "りんご", "赤い")) {
        sawShort = true;
        expect(answer.length).toBeLessThanOrEqual(16);
      }
    }
    expect(sawShort).toBe(true);
  });

  test("formatLearnedReply sometimes echoes the learned words", () => {
    let sawEcho = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const answer = formatLearnedReply(new SeededRandomSource(seed), "りんご", "赤い", "normal", 1);
      if (hasEcho(answer, "りんご", "赤い")) {
        sawEcho = true;
      }
    }
    expect(sawEcho).toBe(true);
  });

  test("formatLearnedReply can use re-learning phrasing", () => {
    let sawRelearn = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const answer = formatLearnedReply(new SeededRandomSource(seed), "りんご", "赤い", "normal", 2);
      if (/もう知ってる|また教えてくれた/u.test(answer)) {
        sawRelearn = true;
      }
    }
    expect(sawRelearn).toBe(true);
  });

  test("formatLearnedReply reflects mood in short replies", () => {
    const proud = formatLearnedReply(new SeededRandomSource(4), "りんご", "赤い", "proud", 1);
    const sleepy = formatLearnedReply(new SeededRandomSource(5), "りんご", "赤い", "sleepy", 1);
    expect(proud === "えへん！" || proud === "できた" || hasEcho(proud, "りんご", "赤い")).toBe(true);
    expect(sleepy === "ねむいけどおぼえた" || sleepy === "zzz…わかった" || hasEcho(sleepy, "りんご", "赤い")).toBe(
      true
    );
  });

  test("formatDeniedLearnReply often returns short denials", () => {
    let sawShort = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const answer = formatDeniedLearnReply(new SeededRandomSource(seed), "りんご", "青い", "normal");
      if (!hasEcho(answer, "りんご", "青い")) {
        sawShort = true;
      }
    }
    expect(sawShort).toBe(true);
  });

  test("formatDeniedLearnReply sometimes echoes the denied words", () => {
    let sawEcho = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const answer = formatDeniedLearnReply(new SeededRandomSource(seed), "りんご", "青い", "normal");
      if (hasEcho(answer, "りんご", "青い")) {
        sawEcho = true;
        expect(answer).toMatch(/じゃない/u);
      }
    }
    expect(sawEcho).toBe(true);
  });
});
