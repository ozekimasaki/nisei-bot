import type { MemoryFact } from "./db.js";
import { defaultEmoji, defaultWords, maybeEmoji } from "./default-brain.js";
import type { RandomSource } from "./random.js";

const fortunes = ["だいきち", "ちゅうきち", "しょうきち", "ねむきち", "えらきち", "ころぶきち"];
const colors = ["赤", "青", "黄色", "緑", "紫", "白", "黒", "透明", "だいたいピンク"];
const items = ["スプーン", "いし", "ふせん", "ぬるい水", "くつした", "まるいもの", "どんぐり", ...defaultWords];

export class FortuneGenerator {
  constructor(private readonly random: RandomSource) {}

  generate(facts: MemoryFact[], snippets: string[], treasures: string[] = [], emojis: string[] = []): string {
    const memoryItem = facts.length > 0 && this.random.chance(0.45) ? this.random.pick(facts).subject : null;
    const treasureItem = treasures.length > 0 && this.random.chance(0.35) ? this.random.pick(treasures) : null;
    const snippetItem = snippets.length > 0 && this.random.chance(0.3) ? this.random.pick(snippets) : null;
    const luckyItem = treasureItem ?? memoryItem ?? snippetItem ?? this.random.pick(items);
    const comment = this.random.pick([
      "きょうはつよい",
      "みぎをみるとよい",
      "ねるとえらい",
      "わすれてもいい",
      "たぶんいいひ"
    ]);

    return [
      "はい",
      "",
      `うんせい: ${this.random.pick(fortunes)}`,
      `らっきーからー: ${this.random.pick(colors)}`,
      `らっきーあいてむ: ${luckyItem}`,
      maybeEmoji(comment, this.random.chance(0.35) ? this.random.pick([...emojis, ...defaultEmoji]) : null)
    ].join("\n");
  }
}
