import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiCache } from './apiCache';

/** A load the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('apiCache', () => {
  beforeEach(() => apiCache.clear());
  afterEach(() => vi.useRealTimers());

  it('serves a cached value until its TTL passes', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => 'v1');
    expect(await apiCache.getOrLoad('k', 1000, load)).toBe('v1');
    expect(await apiCache.getOrLoad('k', 1000, load)).toBe('v1');
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);
    expect(apiCache.get('k')).toBeUndefined();
  });

  it('caches falsy values instead of reloading them', async () => {
    const load = vi.fn(async () => [] as number[]);
    await apiCache.getOrLoad('empty', 1000, load);
    await apiCache.getOrLoad('empty', 1000, load);
    const zero = vi.fn(async () => 0);
    await apiCache.getOrLoad('zero', 1000, zero);
    await apiCache.getOrLoad('zero', 1000, zero);
    expect(load).toHaveBeenCalledTimes(1);
    expect(zero).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed loads', async () => {
    await expect(apiCache.getOrLoad('fail', 1000, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await apiCache.getOrLoad('fail', 1000, async () => 'ok')).toBe('ok');
  });

  it('evicts the least recently used entry when full', () => {
    for (let i = 0; i < 100; i++) apiCache.set(`k${i}`, i, 60_000);
    apiCache.get('k0'); // k0 is now the most recently used
    apiCache.set('new', 'x', 60_000);
    expect(apiCache.get('k0')).toBe(0);
    expect(apiCache.get('k1')).toBeUndefined();
    expect(apiCache.get('new')).toBe('x');
  });

  it('overwriting a key never evicts another', () => {
    for (let i = 0; i < 100; i++) apiCache.set(`k${i}`, i, 60_000);
    apiCache.set('k50', 'again', 60_000);
    expect(apiCache.get('k0')).toBe(0);
  });

  it('a load that started before clear() is not stored', async () => {
    const d = deferred<string>();
    const pending = apiCache.getOrLoad('k', 60_000, () => d.promise);
    apiCache.clear();
    d.resolve('stale');
    expect(await pending).toBe('stale');
    expect(apiCache.get('k')).toBeUndefined();
  });

  it('a load that started before invalidate() is not stored', async () => {
    // e.g. the bracket list was loading when the user created a bracket: the list from before
    // the write must not be cached, or the new bracket stays hidden for the whole TTL.
    const d = deferred<string>();
    const pending = apiCache.getOrLoad('/brackets', 60_000, () => d.promise);
    apiCache.invalidate('/brackets');
    d.resolve('list without the new bracket');
    await pending;
    expect(apiCache.get('/brackets')).toBeUndefined();
  });

  it('invalidating one key leaves in-flight loads of other keys alone', async () => {
    const d = deferred<string>();
    const pending = apiCache.getOrLoad('a', 60_000, () => d.promise);
    apiCache.invalidate('b');
    d.resolve('fresh');
    await pending;
    expect(apiCache.get('a')).toBe('fresh');
  });
});
