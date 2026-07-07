export class ChannelActivityTracker {
  private readonly timestamps = new Map<string, number[]>();
  private readonly lastChatterAt = new Map<string, number>();

  constructor(
    private readonly windowSeconds: number,
    private readonly saturateCount: number,
    private readonly channelCooldownSeconds: number
  ) {}

  record(channelId: string, now = Date.now()): void {
    const windowMs = this.windowSeconds * 1000;
    const cutoff = now - windowMs;
    const times = (this.timestamps.get(channelId) ?? []).filter((time) => time >= cutoff);
    times.push(now);
    this.timestamps.set(channelId, times);
  }

  count(channelId: string, now = Date.now()): number {
    const windowMs = this.windowSeconds * 1000;
    const cutoff = now - windowMs;
    const times = this.timestamps.get(channelId) ?? [];
    return times.filter((time) => time >= cutoff).length;
  }

  level(channelId: string, now = Date.now()): number {
    if (this.saturateCount <= 0) return 0;
    return Math.min(1, this.count(channelId, now) / this.saturateCount);
  }

  getLastChatterAt(channelId: string): Date | null {
    const timestamp = this.lastChatterAt.get(channelId);
    return timestamp == null ? null : new Date(timestamp);
  }

  markChattered(channelId: string, now = Date.now()): void {
    this.lastChatterAt.set(channelId, now);
  }

  isChannelCooldownActive(channelId: string, now = Date.now()): boolean {
    const last = this.lastChatterAt.get(channelId);
    if (last == null) return false;
    return (now - last) / 1000 < this.channelCooldownSeconds;
  }
}
