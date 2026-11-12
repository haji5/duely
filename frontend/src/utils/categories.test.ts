import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './categories';
import { readSharedFixture } from './sharedFixtures';

describe('CATEGORIES', () => {
  it('matches the list the server accepts', () => {
    expect([...CATEGORIES]).toEqual(readSharedFixture<string[]>('categories.json'));
  });
});
