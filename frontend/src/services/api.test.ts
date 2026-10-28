import { describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/config/firebase', () => ({ auth: { currentUser: null } }));

import { errorMessage, errorStatus, fieldErrors } from './api';

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
