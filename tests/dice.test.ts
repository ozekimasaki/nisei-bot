import { describe, expect, test } from "vitest";
import { DiceRoller } from "../src/dice.js";
import { SeededRandomSource } from "../src/random.js";

describe("DiceRoller", () => {
  test("roll1d100 stays in 1..100 and is reproducible with a seed", () => {
    const roller = new DiceRoller(new SeededRandomSource(42));
    const a = roller.roll1d100();
    const b = new DiceRoller(new SeededRandomSource(42)).roll1d100();
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.display).toBe(b.display);
    const value = Number(a.display);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(100);
  });

  test("rollFormula evaluates 2d6 via BCDice DiceBot", async () => {
    const roller = new DiceRoller(new SeededRandomSource(1));
    const result = await roller.rollFormula("2d6");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.display.length).toBeGreaterThan(0);
    expect(result.detail).toMatch(/2D6/i);
  });

  test("rollFormula rejects invalid formulas without falling back", async () => {
    const roller = new DiceRoller(new SeededRandomSource(1));
    const result = await roller.rollFormula("zzz");
    expect(result).toEqual({ ok: false });
  });
});
