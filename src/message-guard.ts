const MAX_TRACKED = 5_000;

export class MessageGuard {
  private readonly inFlight = new Set<string>();
  private readonly handled = new Set<string>();

  isDuplicate(messageId: string): boolean {
    return this.handled.has(messageId) || this.inFlight.has(messageId);
  }

  begin(messageId: string): boolean {
    if (this.isDuplicate(messageId)) return false;
    this.inFlight.add(messageId);
    return true;
  }

  complete(messageId: string): void {
    this.inFlight.delete(messageId);
    this.handled.add(messageId);
    this.trimHandled();
  }

  abort(messageId: string): void {
    this.inFlight.delete(messageId);
  }

  private trimHandled(): void {
    while (this.handled.size > MAX_TRACKED) {
      const oldest = this.handled.values().next().value;
      if (!oldest) break;
      this.handled.delete(oldest);
    }
  }
}
