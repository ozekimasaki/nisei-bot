import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder
} from "discord.js";
import {
  SUMMARY_CONTINUE_PROMPT,
  SUMMARY_MORE_BUTTON_ID,
  SUMMARY_PAGE_TTL_MS,
  SUMMARY_SKIP_BUTTON_ID
} from "./channel-summary.js";

export type SummaryPageSession = {
  userId: string;
  channelName: string;
  truncatedInput: boolean;
  pages: string[];
  pageIndex: number;
  expiresAt: number;
};

const sessions = new Map<string, SummaryPageSession>();

function pruneExpired(now = Date.now()): void {
  for (const [messageId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(messageId);
  }
}

export function saveSummaryPageSession(
  messageId: string,
  session: Omit<SummaryPageSession, "expiresAt" | "pageIndex"> & {
    pageIndex?: number;
  }
): void {
  pruneExpired();
  sessions.set(messageId, {
    ...session,
    pageIndex: session.pageIndex ?? 0,
    expiresAt: Date.now() + SUMMARY_PAGE_TTL_MS
  });
}

export function getSummaryPageSession(messageId: string): SummaryPageSession | null {
  pruneExpired();
  const session = sessions.get(messageId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(messageId);
    return null;
  }
  return session;
}

export function advanceSummaryPage(messageId: string): SummaryPageSession | null {
  const session = getSummaryPageSession(messageId);
  if (!session) return null;
  if (session.pageIndex >= session.pages.length - 1) return session;
  session.pageIndex += 1;
  session.expiresAt = Date.now() + SUMMARY_PAGE_TTL_MS;
  sessions.set(messageId, session);
  return session;
}

export function deleteSummaryPageSession(messageId: string): void {
  sessions.delete(messageId);
}

export function buildSummaryContinueComponents(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SUMMARY_MORE_BUTTON_ID)
        .setLabel("みる")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(SUMMARY_SKIP_BUTTON_ID)
        .setLabel("みない")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function summaryContinueContent(hasMore: boolean): string | null {
  return hasMore ? SUMMARY_CONTINUE_PROMPT : null;
}
