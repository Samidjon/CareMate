/** A small in-memory cache with expiry, so repeated lookups do not hit public services again. */
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

/**
 * Spaces calls to a service at least `intervalMs` apart, as Nominatim and the
 * FOSSGIS router require (one request per second). This holds per server
 * instance; with several instances the shared caches keep the total low, and the
 * README explains when to switch to a dedicated provider.
 */
export class Throttle {
  private next = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly intervalMs: number) {}

  /** Waits for a turn, or gives up if the wait would exceed `maxWaitMs`. */
  wait(maxWaitMs: number): Promise<boolean> {
    const turn = this.chain.then(async () => {
      const delay = this.next - Date.now();
      if (delay > maxWaitMs) return false;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.next = Date.now() + this.intervalMs;
      return true;
    });
    this.chain = turn.then(() => undefined);
    return turn;
  }
}
