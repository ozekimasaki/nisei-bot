import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildBasedChannel,
  type Message,
  type TextChannel
} from "discord.js";
import type { GeminiThinkingLevel } from "./config.js";

export const MAX_FETCH_MESSAGES = 500;
export const MAX_TRANSCRIPT_CHARS = 100_000;
export const SOFT_OUTPUT_LIMIT = 3800;
export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBED_TITLE_LIMIT = 256;
export const MAX_SHORTEN_RETRIES = 3;
export const OUTPUT_CUT_SUFFIX = "…ながすぎた";
export const SUMMARY_EMBED_COLOR = 0x5b8c5a;

export type TranscriptMessage = {
  authorName: string;
  content: string;
  createdTimestamp: number;
  bot: boolean;
};

export type TruncationFlags = {
  truncatedInput: boolean;
  truncatedOutput: boolean;
};

export type ClampResult = {
  text: string;
  truncatedOutput: boolean;
};

export type TrimTranscriptResult = {
  transcript: string;
  truncatedInput: boolean;
};

export type SummarizeOptions = {
  apiKey: string;
  model: string;
  thinkingLevel: GeminiThinkingLevel;
  transcript: string;
  truncatedInput: boolean;
  generateContent?: (prompt: string) => Promise<string>;
};

export type SummarizeResult = {
  text: string;
  truncatedOutput: boolean;
};

function isTextLikeChannel(channel: GuildBasedChannel): channel is TextChannel {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.isTextBased()
  );
}

export function canBotReadChannel(
  channel: GuildBasedChannel,
  botUserId: string
): boolean {
  if (!isTextLikeChannel(channel) || !("permissionsFor" in channel)) return false;
  const perms = channel.permissionsFor(botUserId);
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.ReadMessageHistory)
  );
}

export function canMemberViewChannel(
  channel: GuildBasedChannel,
  memberId: string
): boolean {
  if (!("permissionsFor" in channel)) return false;
  const perms = channel.permissionsFor(memberId);
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.ViewChannel);
}

export function formatMessageLine(message: TranscriptMessage): string | null {
  const parts: string[] = [];
  const text = message.content.trim();
  if (text) parts.push(text);
  if (parts.length === 0) return null;
  return `${message.authorName}: ${parts.join(" ")}`;
}

export function formatTranscript(messages: TranscriptMessage[]): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    const line = formatMessageLine(message);
    if (line) lines.push(line);
  }
  return lines;
}

export function messageToTranscript(message: Message): TranscriptMessage | null {
  if (message.system) return null;

  const parts: string[] = [];
  const text = message.content.trim();
  if (text) parts.push(text);

  for (const attachment of message.attachments.values()) {
    const contentType = attachment.contentType ?? "";
    if (contentType.includes("gif") || attachment.name?.toLowerCase().endsWith(".gif")) {
      parts.push("[GIF]");
    } else if (contentType.startsWith("image/")) {
      parts.push("[画像]");
    } else {
      parts.push("[添付]");
    }
  }

  if (parts.length === 0) return null;

  return {
    authorName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
    content: parts.join(" "),
    createdTimestamp: message.createdTimestamp,
    bot: message.author.bot
  };
}

export function trimTranscript(lines: string[], maxChars: number): TrimTranscriptResult {
  if (lines.length === 0) {
    return { transcript: "", truncatedInput: false };
  }

  const joined = lines.join("\n");
  if (joined.length <= maxChars) {
    return { transcript: joined, truncatedInput: false };
  }

  const kept: string[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    const extra = kept.length === 0 ? line.length : line.length + 1;
    if (total + extra > maxChars) break;
    kept.push(line);
    total += extra;
  }
  kept.reverse();
  return { transcript: kept.join("\n"), truncatedInput: true };
}

export async function fetchMessagesSince(
  channel: TextChannel,
  sinceMs: number,
  maxMessages: number = MAX_FETCH_MESSAGES
): Promise<{ messages: TranscriptMessage[]; truncatedInput: boolean }> {
  const collected: TranscriptMessage[] = [];
  let before: string | undefined;
  let truncatedInput = false;

  while (collected.length < maxMessages) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });
    if (batch.size === 0) break;

    const sorted = [...batch.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp
    );

    let hitOlder = false;
    for (const message of sorted) {
      if (message.createdTimestamp < sinceMs) {
        hitOlder = true;
        break;
      }
      const entry = messageToTranscript(message);
      if (entry) collected.push(entry);
      if (collected.length >= maxMessages) {
        truncatedInput = true;
        break;
      }
    }

    const oldest = sorted[sorted.length - 1];
    if (!oldest || hitOlder || batch.size < 100) break;
    before = oldest.id;
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { messages: collected, truncatedInput };
}

export function buildSummaryPrompt(
  transcript: string,
  options: { truncatedInput: boolean }
): string {
  const notes = [
    "あなたは Discord bot「にせい」。幼稚園児くらいのアホの子。",
    "指定チャンネルの直近24時間の会話ログを、にせいが友達に話す感じでまとめる。",
    `本文は ${SOFT_OUTPUT_LIMIT} 文字以内。Discord の Embed 1つに収める。`,
    "前置き・「まとめます」・メタ発言は禁止。まとめ本文だけ書く。",
    "足りない情報は推測で埋めない。ログにない人名・出来事を作らない。",
    "",
    "【文体】",
    "- ひらがな多め、短文、自信満々。たまに言い間違いや変な感想を入れてよい。",
    "- 「〜なんだって」「〜らしい」「あぶないね！」「えへん！」みたいな口調。",
    "- 人の名前は呼び捨て。さん・くん・ちゃん・様などの敬称は付け足さない（表示名そのものに含まれるならそのままでよい）。",
    "- 絵文字・顔文字は使わない（文字だけで読む）。",
    "- 箇条書きや見出し記号（#、-、*）は使わない。",
    "",
    "【構成】",
    "- 話題ごとにブロックを分ける。各ブロックは1行目に短いタイトル（末尾は！）。",
    "- タイトルの下に2〜4文で、だれが何を話したかを子ども向けに言い換える。",
    "- ブロックとブロックのあいだは空行1つ。",
    "- 話題はだいたい2〜5個。細かい雑談はまとめてよい。にせい自身の発言もネタにしてよい。",
    "",
    "【よい例（この感じで書く）】",
    "あたらしくてすごいAIのはなし！",
    "GPTがでて、みんな大さわぎ！",
    "玉川は「すごく賢い」って言ってた。ボイスでデートもできるんだって。",
    "",
    "とりとにせい！",
    "とりはずっとぴぴぴぴ言ってた。",
    "にせいはステータス「まるい」を報告したよ！おやつはお煎餅。"
  ];
  if (options.truncatedInput) {
    notes.push("", "※ログは一部のみ（新しい方優先）。欠けた部分は推測しない。");
  }

  return `${notes.join("\n")}\n\n--- 会話ログ ---\n${transcript}`;
}

export function buildShortenPrompt(previous: string): string {
  return [
    "まだ長い。にせい口調のまま短く書き直せ。",
    `必ず ${SOFT_OUTPUT_LIMIT} 文字以内。前置き不要。`,
    "話題ブロック（タイトル！＋短い本文、ブロック間は空行）の形は保つ。",
    "呼び捨て・絵文字なしもそのまま守る。",
    "大事な話題を残して、細かい話は削る。",
    "",
    "--- 前回のまとめ ---",
    previous
  ].join("\n");
}

export function needsShortenRetry(text: string): boolean {
  return text.length > SOFT_OUTPUT_LIMIT;
}

export function clampToEmbedDescription(text: string): ClampResult {
  const trimmed = text.trim();
  if (trimmed.length <= SOFT_OUTPUT_LIMIT && trimmed.length <= EMBED_DESCRIPTION_LIMIT) {
    return { text: trimmed, truncatedOutput: false };
  }

  const suffix = OUTPUT_CUT_SUFFIX;
  const maxBody = EMBED_DESCRIPTION_LIMIT - suffix.length;
  const body = trimmed.slice(0, Math.max(0, maxBody));
  return { text: `${body}${suffix}`, truncatedOutput: true };
}

export function buildSummaryFooter(flags: TruncationFlags): string {
  const parts = ["直近24時間"];
  if (flags.truncatedInput) parts.push("一部のみ");
  if (flags.truncatedOutput) parts.push("要約カット");
  return parts.join("・");
}

export function clampEmbedTitle(title: string): string {
  if (title.length <= EMBED_TITLE_LIMIT) return title;
  return title.slice(0, EMBED_TITLE_LIMIT);
}

export function buildSummaryEmbed(options: {
  channelName: string;
  body: string;
  truncatedInput: boolean;
  truncatedOutput: boolean;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SUMMARY_EMBED_COLOR)
    .setTitle(clampEmbedTitle(`#${options.channelName} のまとめ`))
    .setDescription(options.body)
    .setFooter({
      text: buildSummaryFooter({
        truncatedInput: options.truncatedInput,
        truncatedOutput: options.truncatedOutput
      })
    });
}

export function buildErrorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SUMMARY_EMBED_COLOR)
    .setTitle("まとめ失敗")
    .setDescription(description.slice(0, EMBED_DESCRIPTION_LIMIT));
}

export function buildEmptySummaryEmbed(channelName: string): EmbedBuilder {
  return buildSummaryEmbed({
    channelName,
    body: "なにもなかった。静かだった",
    truncatedInput: false,
    truncatedOutput: false
  });
}

async function defaultGenerateContent(
  apiKey: string,
  model: string,
  thinkingLevel: GeminiThinkingLevel,
  prompt: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: toSdkThinkingLevel(thinkingLevel)
      }
    }
  });
  return (response.text ?? "").trim();
}

function toSdkThinkingLevel(level: GeminiThinkingLevel): ThinkingLevel {
  switch (level) {
    case "minimal":
      return ThinkingLevel.MINIMAL;
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export async function summarizeChannelDay(options: SummarizeOptions): Promise<SummarizeResult> {
  const generate =
    options.generateContent ??
    ((prompt: string) =>
      defaultGenerateContent(options.apiKey, options.model, options.thinkingLevel, prompt));

  let text = await generate(buildSummaryPrompt(options.transcript, {
    truncatedInput: options.truncatedInput
  }));

  if (!text) {
    throw new Error("empty_gemini_response");
  }

  let retries = 0;
  while (needsShortenRetry(text) && retries < MAX_SHORTEN_RETRIES) {
    text = await generate(buildShortenPrompt(text));
    if (!text) {
      throw new Error("empty_gemini_response");
    }
    retries += 1;
  }

  if (!needsShortenRetry(text) && text.length <= EMBED_DESCRIPTION_LIMIT) {
    return { text, truncatedOutput: false };
  }

  return clampToEmbedDescription(text);
}

export function resolveSummaryChannel(
  channel: GuildBasedChannel | null
): TextChannel | null {
  if (!channel) return null;
  if (!isTextLikeChannel(channel)) return null;
  if (!channel.isTextBased()) return null;
  if (!("messages" in channel)) return null;
  return channel;
}
