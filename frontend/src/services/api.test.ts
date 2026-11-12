import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

const firebase = vi.hoisted(() => ({ user: null as null | { getIdToken: (force?: boolean) => Promise<string> } }));
vi.mock('@/config/firebase', () => ({ currentFirebaseUser: () => firebase.user }));

import { api, errorMessage, errorStatus, fieldErrors } from './api';

function httpError(status: number | null, data?: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR', config, {},
    status === null ? undefined : { status, statusText: '', headers: {}, config, data });
}

describe('errorMessage', () => {
  it('uses the server message', () => {
    expect(errorMessage(httpError(400, { message: 'Bracket name is required' }))).toBe('Bracket name is required');
  });

  it('falls back when the message is blank, missing or not a string', () => {
    expect(errorMessage(httpError(500, { message: '   ' }), 'fallback')).toBe('fallback');
    expect(errorMessage(httpError(500, { message: 42 }), 'fallback')).toBe('fallback');
    expect(errorMessage(httpError(502, '<html>Bad gateway</html>'), 'fallback')).toBe('fallback');
    expect(errorMessage(httpError(500, null), 'fallback')).toBe('fallback');
  });

  it('says when the server took too long', () => {
    const timeout = new AxiosError('timeout', 'ECONNABORTED', { headers: new AxiosHeaders() });
    expect(errorMessage(timeout)).toMatch(/took too long/);
  });

  it('says the server is unreachable when there is no response', () => {
    expect(errorMessage(httpError(null))).toMatch(/reach the server/);
  });

  it('uses the fallback for non-HTTP errors', () => {
    expect(errorMessage(new Error('x'), 'fallback')).toBe('fallback');
    expect(errorMessage(undefined)).toMatch(/Something went wrong/);
  });
});

describe('fieldErrors and errorStatus', () => {
  it('returns per-field messages only when present', () => {
    expect(fieldErrors(httpError(400, { errors: { name: 'required' } }))).toEqual({ name: 'required' });
    expect(fieldErrors(httpError(400, { message: 'x' }))).toEqual({});
    expect(fieldErrors(httpError(400, { errors: null }))).toEqual({});
    expect(fieldErrors(new Error('x'))).toEqual({});
  });

  it('ignores non-object errors fields', () => {
    expect(fieldErrors(httpError(400, { errors: 'oops' }))).toEqual({});
    expect(fieldErrors(httpError(400, { errors: ['a'] }))).toEqual({});
  });

  it('reads the status', () => {
    expect(errorStatus(httpError(404))).toBe(404);
    expect(errorStatus(httpError(null))).toBeUndefined();
    expect(errorStatus('nope')).toBeUndefined();
  });
});

describe('401 retry', () => {
  const originalAdapter = api.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    firebase.user = null;
  });

  /** An adapter that answers each request with the next status and records the token it carried. */
  function serverAnswering(...statuses: number[]) {
    const tokens: (string | undefined)[] = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      tokens.push(config.headers.Authorization as string | undefined);
      const status = statuses[tokens.length - 1] ?? 200;
      const response = { status, statusText: '', headers: {}, config, data: { ok: status < 400 } };
      if (status >= 400) throw new AxiosError('fail', 'ERR', config, {}, response);
      return response;
    };
    api.defaults.adapter = adapter;
    return tokens;
  }

  /** A signed-in user whose cached token is "old" until a forced refresh. */
  function signedIn(refresh: () => Promise<void> = async () => {}) {
    let token = 'old';
    const getIdToken = vi.fn(async (force?: boolean) => {
      if (force) {
        await refresh();
        token = 'new';
      }
      return token;
    });
    firebase.user = { getIdToken };
    return getIdToken;
  }

  it('refreshes the token and retries once', async () => {
    const getIdToken = signedIn();
    const tokens = serverAnswering(401, 200);
    const response = await api.post('/brackets/1/results', {});
    expect(response.data).toEqual({ ok: true });
    expect(tokens).toEqual(['Bearer old', 'Bearer new']);
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('surfaces a second 401 instead of looping', async () => {
    signedIn();
    const tokens = serverAnswering(401, 401, 200);
    await expect(api.post('/brackets/1/results', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(tokens).toHaveLength(2);
  });

  it('surfaces the 401 when the refresh fails', async () => {
    signedIn(async () => { throw new Error('offline'); });
    const tokens = serverAnswering(401, 200);
    await expect(api.post('/brackets/1/results', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(tokens).toHaveLength(1);
  });

  it('does not retry requests that carried no token', async () => {
    const tokens = serverAnswering(401, 200);
    await expect(api.get('/me/brackets')).rejects.toMatchObject({ response: { status: 401 } });
    expect(tokens).toEqual([undefined]);
  });
});
