import { describe, expect, test } from "vitest";
import { classifyMessage } from "../src/classifier.js";

const options = { botNames: ["にせい", "偽性"], botUserId: "123" };

describe("classifyMessage", () => {
  test("classifies teaching messages", () => {
    expect(classifyMessage("りんごは赤いだよ", options)).toEqual({
      type: "teach",
      subject: "りんご",
      predicate: "赤い"
    });
  });

  test("classifies questions", () => {
    expect(classifyMessage("りんごは？", options)).toEqual({
      type: "question",
      subject: "りんご"
    });
  });

  test("classifies games and command-like text", () => {
    expect(classifyMessage("じゃんけん", options)).toEqual({ type: "jankenStart" });
    expect(classifyMessage("ぐー", options)).toEqual({ type: "jankenHand", hand: "gu" });
    expect(classifyMessage("占って", options)).toEqual({ type: "fortune" });
    expect(classifyMessage("俳句", options)).toEqual({ type: "haiku" });
    expect(classifyMessage("つんつん", options)).toEqual({ type: "poke" });
    expect(classifyMessage("たからもの", options)).toEqual({ type: "treasure" });
  });

  test("classifies bot calls", () => {
    expect(classifyMessage("にせい起きて", options)).toEqual({ type: "mention" });
    expect(classifyMessage("<@123> 起きて", options)).toEqual({ type: "mention" });
  });
});
