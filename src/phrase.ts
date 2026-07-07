const noiseWords = new Set([
  "これ",
  "それ",
  "あれ",
  "ここ",
  "そこ",
  "ため",
  "よう",
  "こと",
  "もの",
  "さん",
  "ちゃん"
]);

export function shouldLearnText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  if (/^https?:\/\//u.test(trimmed)) return false;
  if (/^<a?:\w+:\d+>$/u.test(trimmed)) return false;
  return true;
}

export function extractSnippets(text: string): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[<@!#&>\d]/gu, "")
    .replace(/[、。,.!?！？()[\]{}「」『』"']/gu, " ")
    .trim();

  const parts = cleaned
    .split(/[\s　はがをにへとでものやからより]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 16)
    .filter((part) => !noiseWords.has(part));

  return [...new Set(parts)].slice(0, 3);
}

export function sanitizeFactPart(value: string): string {
  return value.replace(/[。.!！?？]+$/u, "").trim().slice(0, 60);
}

export function extractEmojis(text: string): string[] {
  const custom = text.match(/<a?:[A-Za-z0-9_~]+:\d{15,25}>/gu) ?? [];
  const unicode = text.match(/\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu) ?? [];
  return [...new Set([...custom, ...unicode])].slice(0, 8);
}
