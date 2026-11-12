/**
 * Small in-memory TTL cache for GET responses, so moving between pages doesn't refetch
 * everything. Writes invalidate the exact keys they change; resetApiAuthState() in
 * services/api.ts clears it on sign-in changes. Entries expire lazily; the size cap bounds memory.
 */
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 100;

class ApiCache {
  private entries = new Map<string, CacheEntry>();
  /** Loads in progress, so components asking for the same key at once share one request. */
  private inFlight = new Map<string, Promise<unknown>>();
  /** Bumped by clear(); responses that started before a clear are not stored. */
  private generation = 0;
  /** Per-key counterpart for invalidate(): a load that started before it is not stored. */
  private keyVersions = new Map<string, number>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    if (this.entries.size >= MAX_ENTRIES && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(...keys: string[]): void {
    keys.forEach(key => {
      this.entries.delete(key);
      // A caller after a write must not join a load that started before it.
      this.inFlight.delete(key);
      this.keyVersions.set(key, (this.keyVersions.get(key) ?? 0) + 1);
    });
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.keyVersions.clear();
    this.generation++;
  }

  /** Returns the cached value, joins a load already in progress, or loads, caches and returns it. */
  getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const generation = this.generation;
    const version = this.keyVersions.get(key);
    // Starting the load in a microtask means `promise` is assigned before any callback runs,
    // even when load() throws synchronously.
    const promise: Promise<T> = Promise.resolve()
      .then(load)
      .then(data => {
        if (generation === this.generation && version === this.keyVersions.get(key)) {
          this.set(key, data, ttlMs);
        }
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }
}

export const apiCache = new ApiCache();
