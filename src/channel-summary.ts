import { GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Attachment,
  type GuildBasedChannel,
  type Message,
  type TextChannel
} from "discord.js";
import type { GeminiThinkingLevel } from "./config.js";

export const MAX_FETCH_MESSAGES = Number.POSITIVE_INFINITY;
export const MAX_TRANSCRIPT_CHARS = 100_000;
export const CHUNK_TRANSCRIPT_CHARS = 60_000;
export const MAX_IMAGES_PER_CHUNK = 16;
export const SOFT_OUTPUT_LIMIT = 3800;
export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBED_TITLE_LIMIT = 256;
export const MAX_SHORTEN_RETRIES = 3;
export const OUTPUT_CUT_SUFFIX = "…ながすぎた";
export const SUMMARY_EMBED_COLOR = 0x5b8c5a;
/** @deprecated 画像の全体打ち切りはしない。チャンク内上限は MAX_IMAGES_PER_CHUNK */
export const MAX_SUMMARY_IMAGES = MAX_IMAGES_PER_CHUNK;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;
export const PAGE_CHAR_LIMIT = 3500;
export const MAX_SUMMARY_PAGES = 5;
export const PAGE_MARKER = "<<<PAGE>>>";
export const SUMMARY_CONTINUE_PROMPT = "つづきみる？";
export const SUMMARY_MORE_BUTTON_ID = "nisei_sum:more";
export const SUMMARY_SKIP_BUTTON_ID = "nisei_sum:skip";
export const SUMMARY_PAGE_TTL_MS = 30 * 60 * 1000;

const SUPPORTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export type MessageImageRef = {
  url: string;
  mimeType: string;
  size: number;
};

export type TranscriptMessage = {
  authorName: string;
  content: string;
  createdTimestamp: number;
  bot: boolean;
  images?: MessageImageRef[];
};

export type PendingImage = {
  label: string;
  url: string;
  mimeType: string;
  size: number;
};

export type SummaryImagePart = {
  label: string;
  mimeType: string;
  base64: string;
};

export type TruncationFlags = {
  truncatedInput: boolean;
  truncatedOutput?: boolean;
  pageIndex?: number;
  pageCount?: number;
};

export type ClampResult = {
  text: string;
  truncatedOutput: boolean;
};

export type TrimTranscriptResult = {
  transcript: string;
  truncatedInput: boolean;
};

export type GenerateContentFn = (
  prompt: string,
  images?: SummaryImagePart[]
) => Promise<string>;

export type SummarizeOptions = {
  apiKey: string;
  model: string;
  thinkingLevel: GeminiThinkingLevel;
  transcript: string;
  truncatedInput: boolean;
  images?: SummaryImagePart[];
  generateContent?: GenerateContentFn;
};

export type SummarizeResult = {
  text: string;
  pages: string[];
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

export function resolveImageMime(attachment: Attachment): string | null {
  const raw = (attachment.contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (SUPPORTED_IMAGE_MIME.has(raw)) return raw;

  const name = attachment.name?.toLowerCase() ?? "";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return null;
}

export function formatMessageLine(message: TranscriptMessage): string | null {
  const text = message.content.trim();
  if (!text) return null;
  return `${message.authorName}: ${text}`;
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
  const images: MessageImageRef[] = [];
  const text = message.content.trim();
  if (text) parts.push(text);

  for (const attachment of message.attachments.values()) {
    const mimeType = resolveImageMime(attachment);
    const size = attachment.size ?? 0;
    if (mimeType && size > 0 && size <= MAX_IMAGE_BYTES) {
      images.push({
        url: attachment.url,
        mimeType,
        size
      });
      continue;
    }

    const contentType = attachment.contentType ?? "";
    if (contentType.includes("gif") || attachment.name?.toLowerCase().endsWith(".gif")) {
      parts.push("[GIF]");
    } else if (contentType.startsWith("image/") || mimeType) {
      parts.push("[画像]");
    } else {
      parts.push("[添付]");
    }
  }

  if (parts.length === 0 && images.length === 0) return null;

  return {
    authorName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
    content: parts.join(" "),
    createdTimestamp: message.createdTimestamp,
    bot: message.author.bot,
    images: images.length > 0 ? images : undefined
  };
}

export function applyImageLabels(messages: TranscriptMessage[]): {
  messages: TranscriptMessage[];
  pending: PendingImage[];
  truncatedImages: boolean;
} {
  type Candidate = MessageImageRef & { msgIndex: number; createdTimestamp: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    for (const image of message.images ?? []) {
      candidates.push({
        ...image,
        msgIndex: i,
        createdTimestamp: message.createdTimestamp
      });
    }
  }

  candidates.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp || a.msgIndex - b.msgIndex
  );

  const pending: PendingImage[] = [];
  const labelsByMessage = new Map<number, string[]>();
  candidates.forEach((image, index) => {
    const label = `画像${index + 1}`;
    pending.push({
      label,
      url: image.url,
      mimeType: image.mimeType,
      size: image.size
    });
    const list = labelsByMessage.get(image.msgIndex) ?? [];
    list.push(`[${label}]`);
    labelsByMessage.set(image.msgIndex, list);
  });

  const labeledMessages: TranscriptMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    const tags = labelsByMessage.get(i) ?? [];
    const content = [message.content.trim(), ...tags].filter(Boolean).join(" ");
    if (!content) continue;
    labeledMessages.push({
      authorName: message.authorName,
      content,
      createdTimestamp: message.createdTimestamp,
      bot: message.bot
    });
  }

  return { messages: labeledMessages, pending, truncatedImages: false };
}

export function selectImagesForTranscript(
  transcript: string,
  pending: PendingImage[]
): PendingImage[] {
  return pending.filter((image) => transcript.includes(`[${image.label}]`));
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
  const limited = Number.isFinite(maxMessages);

  while (!limited || collected.length < maxMessages) {
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
      if (limited && collected.length >= maxMessages) {
        truncatedInput = true;
        break;
      }
    }

    const oldest = sorted[sorted.length - 1];
    if (!oldest || hitOlder || batch.size < 100) break;
    if (limited && collected.length >= maxMessages) break;
    before = oldest.id;
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { messages: collected, truncatedInput };
}

export function chunkTranscript(
  lines: string[],
  maxChars: number = CHUNK_TRANSCRIPT_CHARS
): string[] {
  if (lines.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let total = 0;

  for (const line of lines) {
    const extra = current.length === 0 ? line.length : line.length + 1;
    if (current.length > 0 && total + extra > maxChars) {
      chunks.push(current.join("\n"));
      current = [line];
      total = line.length;
      continue;
    }
    current.push(line);
    total += extra;
  }

  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

export function countImageLabels(text: string): number {
  return (text.match(/\[画像\d+\]/g) ?? []).length;
}

export function splitChunkByImageLimit(
  chunk: string,
  maxImages: number = MAX_IMAGES_PER_CHUNK
): string[] {
  if (countImageLabels(chunk) <= maxImages) return [chunk];

  const lines = chunk.split("\n");
  const parts: string[] = [];
  let current: string[] = [];
  let imageCount = 0;

  for (const line of lines) {
    const lineImages = countImageLabels(line);
    if (current.length > 0 && imageCount + lineImages > maxImages) {
      parts.push(current.join("\n"));
      current = [line];
      imageCount = lineImages;
      continue;
    }
    current.push(line);
    imageCount += lineImages;
  }

  if (current.length > 0) parts.push(current.join("\n"));
  return parts.length > 0 ? parts : [chunk];
}

export function imagesForTranscript(
  transcript: string,
  images: SummaryImagePart[]
): SummaryImagePart[] {
  return images.filter((image) => transcript.includes(`[${image.label}]`));
}

export function buildTranscriptChunks(transcript: string): string[] {
  const lines = transcript.split("\n").filter((line) => line.length > 0);
  return chunkTranscript(lines).flatMap((chunk) => splitChunkByImageLimit(chunk));
}

export async function loadSummaryImages(
  pending: PendingImage[],
  fetchImpl: typeof fetch = fetch
): Promise<SummaryImagePart[]> {
  const loaded: SummaryImagePart[] = [];

  for (const image of pending) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
      const response = await fetchImpl(image.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) continue;

      loaded.push({
        label: image.label,
        mimeType: image.mimeType,
        base64: buffer.toString("base64")
      });
    } catch (error) {
      console.error(`Failed to load summary image ${image.label}`, error);
    }
  }

  return loaded;
}

export function finalSummaryStyleRules(): string[] {
  return [
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
}

function imagePromptNotes(imageCount: number): string[] {
  if (imageCount <= 0) return [];
  return [
    "",
    "【画像】",
    `- あとに ${imageCount} 枚の画像が付く。ログの[画像N]がその画像。`,
    "- 画像に写っているものを見て、にせい口調で短く触れてよい。",
    "- 画像にないことは言わない。全部の画像に触れなくてもよい。"
  ];
}

export function buildSummaryPrompt(
  transcript: string,
  options: { truncatedInput: boolean; imageCount: number }
): string {
  const notes = [
    "あなたは Discord bot「にせい」。幼稚園児くらいのアホの子。",
    "指定チャンネルの直近24時間の会話ログを、にせいが友達に話す感じでまとめる。",
    `本文は ${SOFT_OUTPUT_LIMIT} 文字以内。Discord の Embed 1つに収める。`,
    "前置き・「まとめます」・メタ発言は禁止。まとめ本文だけ書く。",
    "足りない情報は推測で埋めない。ログにない人名・出来事を作らない。",
    "",
    ...finalSummaryStyleRules(),
    ...imagePromptNotes(options.imageCount)
  ];

  if (options.truncatedInput) {
    notes.push("", "※ログは一部のみ（新しい方優先）。欠けた部分は推測しない。");
  }

  return `${notes.join("\n")}\n\n--- 会話ログ ---\n${transcript}`;
}

export function buildChunkSummaryPrompt(
  transcript: string,
  options: { partIndex: number; partCount: number; imageCount: number }
): string {
  const notes = [
    "あなたは Discord bot「にせい」。幼稚園児くらいのアホの子。",
    `これは一日の会話の一部（パート ${options.partIndex}/${options.partCount}）。最終まとめではない。`,
    "あとでマージするので、事実と話題を短くにせい口調でメモせよ。",
    "前置き不要。推測しない。呼び捨て。絵文字・顔文字なし。",
    ...imagePromptNotes(options.imageCount)
  ];
  return `${notes.join("\n")}\n\n--- 会話ログ ---\n${transcript}`;
}

export function buildMergeSummaryPrompt(chunkSummaries: string[]): string {
  const body = chunkSummaries
    .map((summary, index) => `【パート${index + 1}】\n${summary}`)
    .join("\n\n");
  const notes = [
    "あなたは Discord bot「にせい」。幼稚園児くらいのアホの子。",
    "一日の一部ごとの中間まとめを、最終の1本のまとめにせよ。",
    `本文は ${SOFT_OUTPUT_LIMIT} 文字以内。Discord の Embed 1つに収める。`,
    "前置き・メタ発言は禁止。まとめ本文だけ書く。推測で埋めない。",
    "最終まとめと同じルールに従う。",
    "",
    ...finalSummaryStyleRules()
  ];
  return `${notes.join("\n")}\n\n--- 中間まとめ ---\n${body}`;
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

export function buildPaginatePrompt(fullText: string): string {
  return [
    "次のまとめが長すぎる。内容は変えず、にせい口調のまま話題の区切りで分割せよ。",
    `各パートは ${PAGE_CHAR_LIMIT} 文字以内。最大 ${MAX_SUMMARY_PAGES} パート。`,
    `パートのあいだは単独行の ${PAGE_MARKER} だけを置く。`,
    "前置き・説明・番号付けは禁止。分割後の本文だけを出力する。",
    "",
    "--- まとめ ---",
    fullText
  ].join("\n");
}

export function parsePagedSummary(text: string): string[] {
  return text
    .split(PAGE_MARKER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isValidPagedSummary(pages: string[]): boolean {
  if (pages.length < 2 || pages.length > MAX_SUMMARY_PAGES) return false;
  return pages.every(
    (page) => page.length > 0 && page.length <= PAGE_CHAR_LIMIT && page.length <= EMBED_DESCRIPTION_LIMIT
  );
}

export function paginateSummaryFallback(
  text: string,
  maxChars: number = PAGE_CHAR_LIMIT
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [""];
  if (trimmed.length <= maxChars) return [trimmed];

  const blocks = trimmed.split(/\n\n+/);
  const pages: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) pages.push(current);
    current = "";
  };

  const appendChunk = (chunk: string) => {
    if (!chunk) return;
    if (chunk.length <= maxChars) {
      const next = current ? `${current}\n\n${chunk}` : chunk;
      if (next.length <= maxChars) {
        current = next;
        return;
      }
      pushCurrent();
      current = chunk;
      return;
    }

    pushCurrent();
    for (let i = 0; i < chunk.length; i += maxChars) {
      pages.push(chunk.slice(i, i + maxChars));
    }
  };

  for (const block of blocks) {
    appendChunk(block.trim());
  }
  pushCurrent();
  return pages.length > 0 ? pages.slice(0, MAX_SUMMARY_PAGES) : [trimmed.slice(0, maxChars)];
}

export async function resolveSummaryPages(
  text: string,
  generate: GenerateContentFn
): Promise<string[]> {
  if (!needsShortenRetry(text) && text.length <= EMBED_DESCRIPTION_LIMIT) {
    return [text];
  }

  try {
    const paged = await generate(buildPaginatePrompt(text));
    const parsed = parsePagedSummary(paged);
    if (isValidPagedSummary(parsed)) return parsed;
  } catch (error) {
    console.error("Failed to paginate summary with Gemini", error);
  }

  return paginateSummaryFallback(text);
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
  if (
    flags.pageCount !== undefined &&
    flags.pageCount > 1 &&
    flags.pageIndex !== undefined
  ) {
    parts.push(`${flags.pageIndex + 1}/${flags.pageCount}`);
  } else if (flags.truncatedOutput) {
    parts.push("要約カット");
  }
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
  truncatedOutput?: boolean;
  pageIndex?: number;
  pageCount?: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SUMMARY_EMBED_COLOR)
    .setTitle(clampEmbedTitle(`#${options.channelName} のまとめ`))
    .setDescription(options.body.slice(0, EMBED_DESCRIPTION_LIMIT))
    .setFooter({
      text: buildSummaryFooter({
        truncatedInput: options.truncatedInput,
        truncatedOutput: options.truncatedOutput,
        pageIndex: options.pageIndex,
        pageCount: options.pageCount
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

function buildContents(prompt: string, images?: SummaryImagePart[]): Part[] {
  const parts: Part[] = [{ text: prompt }];
  if (!images || images.length === 0) return parts;

  for (const image of images) {
    parts.push({ text: `\n(${image.label})` });
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64
      }
    });
  }
  return parts;
}

async function defaultGenerateContent(
  apiKey: string,
  model: string,
  thinkingLevel: GeminiThinkingLevel,
  prompt: string,
  images?: SummaryImagePart[]
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: buildContents(prompt, images),
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
  const images = options.images ?? [];
  const generate: GenerateContentFn =
    options.generateContent ??
    ((prompt, imageParts) =>
      defaultGenerateContent(
        options.apiKey,
        options.model,
        options.thinkingLevel,
        prompt,
        imageParts
      ));

  const chunks = buildTranscriptChunks(options.transcript);
  if (chunks.length === 0) {
    throw new Error("empty_gemini_response");
  }

  let text: string;
  if (chunks.length === 1) {
    const chunk = chunks[0]!;
    const chunkImages = imagesForTranscript(chunk, images);
    text = await generate(
      buildSummaryPrompt(chunk, {
        truncatedInput: options.truncatedInput,
        imageCount: chunkImages.length
      }),
      chunkImages.length > 0 ? chunkImages : undefined
    );
  } else {
    const partials: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      const chunkImages = imagesForTranscript(chunk, images);
      try {
        const partial = await generate(
          buildChunkSummaryPrompt(chunk, {
            partIndex: i + 1,
            partCount: chunks.length,
            imageCount: chunkImages.length
          }),
          chunkImages.length > 0 ? chunkImages : undefined
        );
        partials.push(partial || `パート${i + 1}はまとめられなかった`);
      } catch (error) {
        console.error(`Failed to summarize chunk ${i + 1}`, error);
        partials.push(`パート${i + 1}はまとめられなかった`);
      }
    }

    text = await generate(buildMergeSummaryPrompt(partials));
  }

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

  const pages = await resolveSummaryPages(text, generate);
  const first = pages[0] ?? text;
  return {
    text: first,
    pages,
    truncatedOutput: false
  };
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
