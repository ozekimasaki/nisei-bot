import { describe, expect, test } from "vitest";
import { pickSearchIndex, truncateExtract } from "../src/wikipedia.js";
import { SeededRandomSource } from "../src/random.js";

describe("wikipedia helpers", () => {
  test("truncates long extract", () => {
    const long = "あ".repeat(120);
    expect(truncateExtract(long, 80).endsWith("…")).toBe(true);
  });

  test("pickSearchIndex stays in range", () => {
    const random = new SeededRandomSource(7);
    const index = pickSearchIndex(random, 5, 1);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
  });
});
