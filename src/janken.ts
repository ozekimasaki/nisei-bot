import type { JankenHand } from "./classifier.js";
import type { RandomSource } from "./random.js";
import { withMaybeOpener } from "./utterance.js";

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

export type JankenResult = {
  text: string;
  botWon: boolean;
};

export class JankenGame {
  constructor(
    private readonly random: RandomSource,
    private readonly winRate: number
  ) {}

  start(): string {
    return this.random.pick([
      withMaybeOpener(this.random, "じゃんけんする"),
      withMaybeOpener(this.random, "てをだす"),
      "じゃんけん。いく",
      "いくよ"
    ]);
  }

  rematch(): string {
    return this.random.pick([
      "もう一回",
      "いくよ",
      "てをだす",
      "まだやる"
    ]);
  }

  play(userHand: JankenHand, streak?: { winStreak: number; loseStreak: number }): JankenResult {
    const cheatsSuccessfully = this.random.chance(this.winRate);
    const botHand = cheatsSuccessfully ? winningHand[userHand] : losingHand[userHand];

    if (cheatsSuccessfully && this.random.chance(0.08)) {
      return {
        botWon: false,
        text: this.say(botHand, [
          "まけた！ あれ",
          "あれ。かった？",
          "むずかしい",
          "ちがうかも"
        ])
      };
    }

    if (cheatsSuccessfully) {
      const moods = [
        "かった",
        "つよい",
        "えへん",
        "いまかしこい",
        "まるい勝ち",
        "わたしのほうが大きい"
      ];
      if (streak && streak.winStreak >= 2) {
        moods.push("つよすぎ", "まだつよい");
      }
      return { botWon: true, text: this.say(botHand, moods) };
    }

    const moods = [
      "かった！ ……まけてる？",
      "あれ",
      "これは勝ち？",
      "わからん",
      "つよいはず",
      "手が勝手に",
      "ちょきはぐー"
    ];
    if (streak && streak.loseStreak >= 3) {
      moods.push("ねむい", "やめて");
    }
    return { botWon: false, text: this.say(botHand, moods) };
  }

  private say(hand: JankenHand, moods: readonly string[]): string {
    const mood = this.random.pick(moods);
    return this.random.pick([
      withMaybeOpener(this.random, `${labels[hand]}。${mood}`),
      `${labels[hand]}。${mood}`,
      `${mood}。${labels[hand]}`
    ]);
  }
}
