export class WikiCooldown {
  private readonly lastUsed = new Map<string, number>();

  canUse(guildId: string, cooldownSeconds: number): boolean {
    const last = this.lastUsed.get(guildId);
    if (!last) return true;
    return Date.now() - last >= cooldownSeconds * 1000;
  }

  markUsed(guildId: string): void {
    this.lastUsed.set(guildId, Date.now());
  }
}
