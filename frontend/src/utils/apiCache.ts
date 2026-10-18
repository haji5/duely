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
  /** Bumped by clear(); responses that started before a clear are not stored. */
  private generation = 0;

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
    keys.forEach(key => this.entries.delete(key));
  }

  clear(): void {
    this.entries.clear();
    this.generation++;
  }

  /** Returns the cached value or loads, caches and returns it. */
  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const generation = this.generation;
    const data = await load();
    if (generation === this.generation) {
      this.set(key, data, ttlMs);
    }
    return data;
  }
}

export const apiCache = new ApiCache();
