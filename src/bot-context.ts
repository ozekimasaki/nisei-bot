export type BotReplyRecord = {
  text: string;
  subject?: string;
  at: number;
};

const TTL_MS = 5 * 60 * 1000;

export class BotReplyTracker {
  private readonly replies = new Map<string, BotReplyRecord>();

  private key(guildId: string, channelId: string): string {
    return `${guildId}:${channelId}`;
  }

  record(guildId: string, channelId: string, text: string, subject?: string): void {
    this.replies.set(this.key(guildId, channelId), {
      text,
      subject,
      at: Date.now()
    });
  }

  get(guildId: string, channelId: string): BotReplyRecord | null {
    const record = this.replies.get(this.key(guildId, channelId));
    if (!record) return null;
    if (Date.now() - record.at > TTL_MS) {
      this.replies.delete(this.key(guildId, channelId));
      return null;
    }
    return record;
  }
}
