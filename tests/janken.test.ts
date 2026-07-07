import { describe, expect, test } from "vitest";
import { JankenGame } from "../src/janken.js";
import { SeededRandomSource } from "../src/random.js";

describe("JankenGame", () => {
  test("usually cheats after seeing the user's hand", () => {
    const game = new JankenGame(new SeededRandomSource(1), 1);
    expect(game.play("gu")).toContain("ぱー");
    expect(game.play("choki")).toContain("ぐー");
    expect(game.play("pa")).toContain("ちょき");
  });

  test("can fail when the configured win rate is zero", () => {
    const game = new JankenGame(new SeededRandomSource(1), 0);
    expect(game.play("gu")).toContain("ちょき");
  });
});
