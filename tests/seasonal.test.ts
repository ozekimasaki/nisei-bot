import { describe, expect, test } from "vitest";
import { dailySnack, seasonalHint } from "../src/seasonal.js";

describe("seasonal", () => {
  test("dailySnack is stable for same day", () => {
    const date = new Date("2026-07-07T12:00:00Z");
    expect(dailySnack(date)).toBe(dailySnack(date));
  });

  test("seasonalHint returns string in July", () => {
    const date = new Date("2026-07-07T12:00:00Z");
    expect(seasonalHint(date)).toBeTruthy();
  });
});
