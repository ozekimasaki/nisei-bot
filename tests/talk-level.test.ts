import { describe, expect, it } from "vitest";
import {
  clampTalkLevel,
  resolveTalkLevel,
  talkLevelFromTalkativeness
} from "../src/talk-level.js";

describe("clampTalkLevel", () => {
  it("clamps to 0-10", () => {
    expect(clampTalkLevel(-3)).toBe(0);
    expect(clampTalkLevel(0)).toBe(0);
    expect(clampTalkLevel(5)).toBe(5);
    expect(clampTalkLevel(10)).toBe(10);
    expect(clampTalkLevel(12)).toBe(10);
  });

  it("rounds fractional values", () => {
    expect(clampTalkLevel(4.6)).toBe(5);
  });
});

describe("resolveTalkLevel", () => {
  it("uses guild override when set", () => {
    expect(resolveTalkLevel(7, 5)).toBe(7);
  });

  it("falls back to config default when guild override is null", () => {
    expect(resolveTalkLevel(null, 5)).toBe(5);
  });
});

describe("talkLevelFromTalkativeness", () => {
  it("maps legacy env values", () => {
    expect(talkLevelFromTalkativeness("quiet")).toBe(3);
    expect(talkLevelFromTalkativeness("normal")).toBe(5);
    expect(talkLevelFromTalkativeness("loud")).toBe(10);
  });
});
