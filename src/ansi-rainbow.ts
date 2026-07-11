/** Discord ```ansi``` FG colors used by the colored-text generator (rebane2001). */
const RAINBOW_FG = [31, 33, 32, 36, 34, 35] as const;

/**
 * Format text as bold rainbow ANSI inside a Discord ansi code fence.
 * "h1" in the generator maps to bold (style 1).
 */
export function formatRainbowAnsi(text: string): string {
  let colored = "";
  let colorIndex = 0;
  for (const char of text) {
    if (char === "\n") {
      colored += "\n";
      continue;
    }
    const fg = RAINBOW_FG[colorIndex % RAINBOW_FG.length]!;
    colored += `\x1b[1;${fg}m${char}`;
    colorIndex += 1;
  }
  colored += "\x1b[0m";
  return ["```ansi", colored, "```"].join("\n");
}
