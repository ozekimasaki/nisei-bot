const snacks = ["おやつ", "どんぐり", "おもち", "スプーン", "りんご", "みかん", "せんべい", "ぐみ"];

const seasonalByMonth: Record<number, string[]> = {
  0: ["お正月", "こたつ", "みかん"],
  1: ["節分", "はる"],
  2: ["さくら", "はる"],
  3: ["しゃば", "あつい"],
  4: ["つゆ", "あじさい"],
  5: ["うみ", "あつい"],
  6: ["花火", "うみ"],
  7: ["かき氷", "あつい"],
  8: ["おつきみ", "すずしい"],
  9: ["ハロウィン", "かぼちゃ"],
  10: ["こたつ", "さむい"],
  11: ["クリスマス", "ケーキ", "さむい"]
};

export function dailySnack(date = new Date()): string {
  const seed = date.getFullYear() * 1000 + date.getMonth() * 50 + date.getDate();
  return snacks[seed % snacks.length]!;
}

export function seasonalHint(date = new Date()): string | null {
  const words = seasonalByMonth[date.getMonth()];
  if (!words || words.length === 0) return null;
  const seed = date.getDate();
  return words[seed % words.length]!;
}

export function dailyMoodWord(date = new Date()): string {
  const words = ["ねむい", "げんき", "まるい", "おやつ", "たぶん", "えらい"];
  const seed = date.getFullYear() * 100 + date.getMonth() * 10 + date.getDate();
  return words[seed % words.length]!;
}
