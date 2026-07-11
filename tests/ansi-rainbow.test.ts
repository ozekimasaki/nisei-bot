import { describe, expect, test } from "vitest";
import { formatRainbowAnsi } from "../src/ansi-rainbow.js";

describe("formatRainbowAnsi", () => {
  test("wraps text in an ansi code fence with bold color codes", () => {
    const result = formatRainbowAnsi("42");
    expect(result.startsWith("```ansi\n")).toBe(true);
    expect(result.endsWith("\n```")).toBe(true);
    expect(result).toContain("\x1b[1;31m4");
    expect(result).toContain("\x1b[1;33m2");
    expect(result).toContain("\x1b[0m");
  });
});
