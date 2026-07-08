import type { Mood } from "./mood.js";
import { emojisForMood } from "./mood.js";

export const defaultWords = [
  "ねむい",
  "えらい",
  "つよい",
  "まるい",
  "あったかい",
  "おもち",
  "スプーン",
  "どんぐり",
  "こたつ",
  "右",
  "左",
  "たぶん",
  "偽性",
  "おやつ",
  "ふとん",
  "水",
  "石",
  "月",
  "朝",
  "なぞ"
];

export const defaultThoughts = [
  "いま考えてる",
  "なんか知ってる",
  "わかった気がした",
  "ちょっとかしこい",
  "たぶんそう",
  "あれ？",
  "いま忙しい。考えるので",
  "それ見たことある",
  "名前つけたい",
  "むずかしいから好き",
  "大事かも",
  "それは丸い",
  "これは偽性",
  "さっき覚えた気がする",
  "忘れない。たぶん"
];

export const defaultEmoji = [
  "✨",
  "🌙",
  "🍎",
  "🫧",
  "🪨",
  "🧠",
  "💤",
  "🌱",
  "⭐",
  "🍵",
  "🌀",
  "🙌",
  "🍪",
  "🍙",
  "🍡",
  "🧁",
  "🍦",
  "🍫",
  "🌸",
  "🍀",
  "🌈",
  "☁️",
  "🌊",
  "🍂",
  "🐱",
  "🐶",
  "🐸",
  "🐻",
  "🐰",
  "🦆",
  "😴",
  "😪",
  "🤔",
  "😮",
  "😋",
  "🥺",
  "😤",
  "🧸",
  "🎈",
  "🎀",
  "🔮",
  "💫",
  "🎵",
  "📎"
];

export function buildEmojiPool(learned: readonly string[], mood?: Mood): string[] {
  const moodPool = mood ? emojisForMood(mood) : [];
  return [...new Set([...learned, ...moodPool, ...defaultEmoji])];
}

export const defaultOpeners = [
  "",
  "",
  "",
  "うん",
  "へへ",
  "なに",
  "あれ",
  "はい"
];

export const defaultReactions = [
  "はい",
  "うん",
  "へへ",
  "なに",
  "そうかも",
  "ちがうかも",
  "できる",
  "できない",
  "見てる",
  "聞いた",
  "おぼえたふり",
  "すごいかも",
  "わかった。あとで忘れる",
  "それ偽性ある",
  "いまのよかった",
  "ちょっと好き",
  "それは宝",
  "あたまが動いた"
];

export function maybeEmoji(text: string, emoji: string | null): string {
  if (!emoji) return text;
  return `${text} ${emoji}`;
}
