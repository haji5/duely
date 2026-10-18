import { describe, expect, it } from 'vitest';
import type { Item } from '@/types';
import { computeRankings } from './rankings';

const item = (id: number): Item => ({ id, bracketId: 1, title: `#${id}`, mediaUrl: 'https://x.test', mediaType: 'image' });
const items = [1, 2, 3, 4].map(item);

describe('computeRankings', () => {
  it('matches the server formula (same runs as the backend integration test)', () => {
    const rankings = computeRankings([
      { ranking: [1, 2, 3, 4], matches: [{ winnerId: 1, loserId: 2 }, { winnerId: 1, loserId: 3 }, { winnerId: 2, loserId: 4 }] },
      { ranking: [2, 1, 4, 3], matches: [{ winnerId: 2, loserId: 1 }, { winnerId: 2, loserId: 4 }, { winnerId: 1, loserId: 3 }] },
      { ranking: [1, 3], matches: [{ winnerId: 1, loserId: 3 }] },
    ], items);

    expect(rankings.map(r => r.item.id)).toEqual([1, 2, 4, 3]);
    expect(rankings[0]).toMatchObject({ wins: 4, totalMatches: 5, winPercentage: 80, timesRanked: 3 });
    expect(rankings[0].averageScore).toBeCloseTo((1 + 2 / 3 + 1) / 3, 12);
    expect(rankings[1]).toMatchObject({ wins: 3, totalMatches: 4, winPercentage: 75, timesRanked: 2 });
    expect(rankings[2].averageScore).toBeCloseTo(1 / 6, 12);
    expect(rankings[3]).toMatchObject({ wins: 0, totalMatches: 3, winPercentage: 0 });
  });

  it('normalises scores so a small run’s champion beats a big run’s middle', () => {
    const rankings = computeRankings([
      { ranking: [1, 2] },
      { ranking: [3, 4, 2, 1] },
    ], items);
    expect(rankings[0].item.id).toBe(3);
    expect(rankings.find(r => r.item.id === 1)!.averageScore).toBeCloseTo(0.5, 12);
  });

  it('falls back to list position for runs without matches', () => {
    const [top] = computeRankings([{ ranking: [1, 2, 3] }], items);
    expect(top).toMatchObject({ wins: 2, totalMatches: 2, winPercentage: 100 });
  });

  it('breaks ties by appearances, then id, and skips unknown items', () => {
    const rankings = computeRankings([{ ranking: [4, 3] }, { ranking: [2, 1] }, { ranking: [9, 1] }], items);
    expect(rankings.map(r => r.item.id)).toEqual([2, 4, 1, 3]);
  });
});
