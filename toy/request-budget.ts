export const requestTimeout = 6000;
export const retryBackoff = (count: number) => Math.min(30_000, 1200 * 2 ** (count - 1)) + Math.random() * 400;

/** Cloud and leaderboard requests share the publisher's Toy-wide quota. */
export class ToyRequestBudget {
  private readonly listeners = new Set<() => void>();
  private limitedUntil = 0;
  private limits = 0;
  private wake?: ReturnType<typeof setTimeout>;

  get limited() { return Date.now() < this.limitedUntil; }
  get retryAt() { return this.limitedUntil; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    if (this.listeners.size === 1 && this.limited) this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) clearTimeout(this.wake);
    };
  }

  private changed() { for (const listener of this.listeners) listener(); }

  private schedule() {
    clearTimeout(this.wake);
    this.wake = setTimeout(() => this.changed(), this.limitedUntil - Date.now());
  }

  limit() {
    this.limitedUntil = Math.max(this.limitedUntil, Date.now() + retryBackoff(++this.limits));
    this.schedule();
    this.changed();
    return this.limitedUntil;
  }
}
