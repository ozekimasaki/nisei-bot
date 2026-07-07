import type { JankenHand } from "./classifier.js";
import type { RandomSource } from "./random.js";

const labels: Record<JankenHand, string> = {
  gu: "ぐー",
  choki: "ちょき",
  pa: "ぱー"
};

const winningHand: Record<JankenHand, JankenHand> = {
  gu: "pa",
  choki: "gu",
  pa: "choki"
};

const losingHand: Record<JankenHand, JankenHand> = {
  gu: "choki",
  choki: "pa",
  pa: "gu"
};

export class JankenGame {
  constructor(
    private readonly random: RandomSource,
    private readonly winRate: number
  ) {}

  start(): string {
    return this.random.pick([
      "はい\nじゃんけんする",
      "はい\nてをだす",
      "じゃんけん。いく"
    ]);
  }

  play(userHand: JankenHand): string {
    const cheatsSuccessfully = this.random.chance(this.winRate);
    const botHand = cheatsSuccessfully ? winningHand[userHand] : losingHand[userHand];

    if (cheatsSuccessfully && this.random.chance(0.08)) {
      return this.say(botHand, [
        "まけた！ あれ",
        "あれ。かった？",
        "むずかしい",
        "ちがうかも"
      ]);
    }

    if (cheatsSuccessfully) {
      return this.say(botHand, [
        "かった",
        "つよい",
        "えへん",
        "いまかしこい",
        "まるい勝ち",
        "わたしのほうが大きい"
      ]);
    }

    return this.say(botHand, [
      "かった！ ……まけてる？",
      "あれ",
      "これは勝ち？",
      "わからん",
      "つよいはず"
    ]);
  }

  private say(hand: JankenHand, moods: readonly string[]): string {
    return this.random.pick([
      `はい\n${labels[hand]}。${this.random.pick(moods)}`,
      `${labels[hand]}。${this.random.pick(moods)}`,
      `${this.random.pick(moods)}。${labels[hand]}`
    ]);
  }
}
