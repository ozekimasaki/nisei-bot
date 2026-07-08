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

  test("treats overly long teach messages as chatter", () => {
    const longPredicate = "あ".repeat(41);
    expect(classifyMessage(`りんごは${longPredicate}だよ`, options)).toEqual({ type: "chatter" });
  });

  test("classifies questions", () => {
    expect(classifyMessage("りんごは？", options)).toEqual({
      type: "question",
      subject: "りんご"
    });
    expect(classifyMessage("りんごって？", options)).toEqual({
      type: "question",
      subject: "りんご"
    });
    expect(classifyMessage("りんごは何？", options)).toEqual({
      type: "question",
      subject: "りんご"
    });
    expect(classifyMessage("りんごなんだっけ？", options)).toEqual({
      type: "question",
      subject: "りんご"
    });
    expect(classifyMessage("何？", options)).toEqual({
      type: "question",
      subject: "何"
    });
  });

  test("does not treat casual questions as bot questions", () => {
    expect(classifyMessage("マジで？", options)).toEqual({ type: "chatter" });
    expect(classifyMessage("どう思う？", options)).toEqual({ type: "chatter" });
    expect(classifyMessage("今日寒くない？", options)).toEqual({ type: "chatter" });
    expect(classifyMessage("そうなの？", options)).toEqual({ type: "chatter" });
  });

  test("classifies games and command-like text", () => {
    expect(classifyMessage("じゃんけん", options)).toEqual({ type: "jankenStart" });
    expect(classifyMessage("ぐー", options)).toEqual({ type: "jankenHand", hand: "gu" });
    expect(classifyMessage("占って", options)).toEqual({ type: "fortune" });
    expect(classifyMessage("俳句", options)).toEqual({ type: "haiku" });
    expect(classifyMessage("つんつん", options)).toEqual({ type: "poke" });
    expect(classifyMessage("たからもの", options)).toEqual({ type: "treasure" });
    expect(classifyMessage("りんご 調べて", options)).toEqual({ type: "wikiSearch", query: "りんご" });
    expect(classifyMessage("クイズ", options)).toEqual({ type: "quiz" });
    expect(classifyMessage("クイズして", options)).toEqual({ type: "quiz" });
    expect(classifyMessage("テスト", options)).toEqual({ type: "chatter" });
    expect(classifyMessage("なに覚えてる", options)).toEqual({ type: "chatter" });
    expect(classifyMessage("かんちがい", options)).toEqual({ type: "kanchigai" });
    expect(classifyMessage("図鑑", options)).toEqual({ type: "album" });
    expect(classifyMessage("ちがう", options)).toEqual({ type: "correction" });
  });

  test("classifies bot calls", () => {
    expect(classifyMessage("にせい起きて", options)).toEqual({ type: "mention" });
    expect(classifyMessage("<@123> 起きて", options)).toEqual({ type: "mention" });
  });

  test("classifies quiet mode on phrases", () => {
    expect(classifyMessage("静かに", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("しずかに", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("静かにして", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("静かにしといて", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("静かにで", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("今から静かにして", options)).toEqual({ type: "quietOn" });
    expect(classifyMessage("にせい、静かにして", options)).toEqual({ type: "quietOn" });
  });

  test("classifies quiet mode off phrases", () => {
    expect(classifyMessage("静かにやめて", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("静かにやめ", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("しずかにやめて", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("出てきて", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("また話して", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("戻ってきて", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("もういいよ", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("にせい、出てきて", options)).toEqual({ type: "quietOff" });
    expect(classifyMessage("静かにやめてね", options)).toEqual({ type: "quietOff" });
  });
});
