import { describe, expect, it } from "vitest";
import { needsUnsolicitedChance } from "../src/unsolicited.js";

describe("needsUnsolicitedChance", () => {
  it("requires a chance roll for social intents when bot is not called", () => {
    expect(needsUnsolicitedChance("greeting")).toBe(true);
    expect(needsUnsolicitedChance("fortune")).toBe(true);
    expect(needsUnsolicitedChance("question")).toBe(true);
    expect(needsUnsolicitedChance("chatter")).toBe(true);
    expect(needsUnsolicitedChance("attachment")).toBe(true);
  });

  it("allows direct feature intents without the unsolicited roll", () => {
    expect(needsUnsolicitedChance("teach")).toBe(false);
    expect(needsUnsolicitedChance("wikiSearch")).toBe(false);
    expect(needsUnsolicitedChance("jankenStart")).toBe(false);
    expect(needsUnsolicitedChance("mention")).toBe(false);
  });
});
