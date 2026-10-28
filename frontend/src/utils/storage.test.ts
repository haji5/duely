import { afterEach, describe, expect, it, vi } from 'vitest';
import { local, session } from './storage';

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('reads, writes and removes', () => {
    local.set('k', 'v');
    expect(local.get('k')).toBe('v');
    local.remove('k');
    expect(local.get('k')).toBeNull();
    session.set('s', '1');
    expect(window.sessionStorage.getItem('s')).toBe('1');
  });

  it('never throws when storage is blocked or full', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(local.get('k')).toBeNull();
    expect(() => local.set('k', 'v')).not.toThrow();
    expect(() => session.remove('k')).not.toThrow();
  });
});
