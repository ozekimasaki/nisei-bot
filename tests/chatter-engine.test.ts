import { describe, expect, it } from "vitest";
import {
  computeInterjectChance,
  hasEmotionInText,
  hasRecentSnippetMatch,
  shouldInterject,
  talkativenessBase,
  type InterjectInput
} from "../src/chatter-engine.js";
import { SeededRandomSource } from "../src/random.js";

function baseInput(overrides: Partial<InterjectInput> = {}): InterjectInput {
  return {
    now: 1_000_000,
    talkativeness: "normal",
    cooldownSeconds: 15,
    channelCooldownSeconds: 12,
    guildLastSpokeAt: null,
    channelLastChatterAt: null,
    activityLevel: 0,
    userAffection: 0,
    hasKnownWord: false,
    hasRecentSnippet: false,
    mood: "normal",
    messageLength: 10,
    hasEmotion: false,
    activityBoostMax: 0.3,
    affectionTalkCap: 0.2,
    chanceCap: 0.8,
    ...overrides
  };
}

describe("talkativenessBase", () => {
  it("returns aggressive defaults per mode", () => {
    expect(talkativenessBase("quiet")).toBe(0.14);
    expect(talkativenessBase("normal")).toBe(0.28);
    expect(talkativenessBase("loud")).toBe(0.45);
  });
});

describe("hasEmotionInText", () => {
  it("detects emotional wording", () => {
    expect(hasEmotionInText("今日やばい")).toBe(true);
    expect(hasEmotionInText("普通の雑談")).toBe(false);
  });
});

describe("hasRecentSnippetMatch", () => {
  it("matches overlapping snippet text", () => {
    expect(hasRecentSnippetMatch("りんごおいしい", ["りんご"])).toBe(true);
    expect(hasRecentSnippetMatch("今日は晴れ", ["りんご"])).toBe(false);
  });
});

describe("computeInterjectChance", () => {
  it("returns zero during guild cooldown", () => {
    const chance = computeInterjectChance(
      baseInput({
        guildLastSpokeAt: new Date(1_000_000 - 5_000)
      })
    );
    expect(chance).toBe(0);
  });

  it("returns zero during channel cooldown", () => {
    const chance = computeInterjectChance(
      baseInput({
        channelLastChatterAt: new Date(1_000_000 - 5_000)
      })
    );
    expect(chance).toBe(0);
  });

  it("increases chance with activity level", () => {
    const quiet = computeInterjectChance(baseInput({ activityLevel: 0 }));
    const active = computeInterjectChance(baseInput({ activityLevel: 1 }));
    expect(active).toBeGreaterThan(quiet);
  });

  it("multiplies chance when a known word is present", () => {
    const plain = computeInterjectChance(baseInput());
    const known = computeInterjectChance(baseInput({ hasKnownWord: true }));
    expect(known).toBeGreaterThan(plain);
  });

  it("does not exceed the configured cap", () => {
    const chance = computeInterjectChance(
      baseInput({
        talkativeness: "loud",
        activityLevel: 1,
        userAffection: 100,
        hasKnownWord: true,
        hasRecentSnippet: true,
        mood: "genki",
        hasEmotion: true,
        messageLength: 80
      })
    );
    expect(chance).toBeLessThanOrEqual(0.8);
  });
});

describe("shouldInterject", () => {
  it("returns false when chance is zero", () => {
    const random = new SeededRandomSource(1);
    expect(
      shouldInterject(
        baseInput({
          guildLastSpokeAt: new Date(1_000_000 - 1_000)
        }),
        random
      )
    ).toBe(false);
  });

  it("returns true when chance is one and seed allows it", () => {
    const random = new SeededRandomSource(1);
    expect(
      shouldInterject(
        baseInput({
          talkativeness: "loud",
          activityLevel: 1,
          chanceCap: 1
        }),
        random
      )
    ).toBe(true);
  });
});
