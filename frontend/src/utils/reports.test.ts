import { describe, expect, it } from 'vitest';
import { isAdminClaims, reasonLabel, REPORT_REASONS } from './reports';
import { readSharedFixture } from './sharedFixtures';

describe('REPORT_REASONS', () => {
  it('matches the reasons the server accepts', () => {
    expect(REPORT_REASONS.map(r => r.value)).toEqual(readSharedFixture<string[]>('report-reasons.json'));
  });

  it('labels known reasons and passes unknown ones through', () => {
    expect(reasonLabel('spam')).toBe('Spam or advertising');
    expect(reasonLabel('retired-reason')).toBe('retired-reason');
  });
});

describe('isAdminClaims', () => {
  it('accepts the claims the server accepts and nothing else', () => {
    expect(isAdminClaims({ admin: true })).toBe(true);
    expect(isAdminClaims({ role: 'ADMIN' })).toBe(true);
    expect(isAdminClaims({ role: 'admin' })).toBe(true);
    expect(isAdminClaims({ admin: 'true' })).toBe(false);
    expect(isAdminClaims({ role: 'moderator' })).toBe(false);
    expect(isAdminClaims({})).toBe(false);
  });
});
