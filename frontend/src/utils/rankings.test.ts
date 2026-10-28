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

  it('returns nothing for no runs', () => {
    expect(computeRankings([], items)).toEqual([]);
    expect(computeRankings([{ ranking: [1, 2], matches: [{ winnerId: 1, loserId: 2 }] }], [])).toEqual([]);
  });

  it('treats an empty match list as "no matches", not as a legacy run', () => {
    // Server: matches != null means real matches, even when the list is empty.
    const [top] = computeRankings([{ ranking: [1, 2], matches: [] }], items);
    expect(top).toMatchObject({ wins: 0, totalMatches: 0, winPercentage: 0, averageScore: 1 });
  });

  it('mixes legacy and modern runs', () => {
    const rankings = computeRankings([
      { ranking: [1, 2], matches: null },
      { ranking: [2, 1], matches: [{ winnerId: 2, loserId: 1 }] },
    ], items);
    const one = rankings.find(r => r.item.id === 1)!;
    expect(one).toMatchObject({ wins: 1, totalMatches: 2, winPercentage: 50, timesRanked: 2 });
    expect(one.averageScore).toBeCloseTo(0.5, 12);
  });

  it('rounds win percentages like the server (Math.round, half up)', () => {
    const rankings = computeRankings([
      { ranking: [1, 2, 3, 4], matches: [{ winnerId: 1, loserId: 3 }, { winnerId: 2, loserId: 4 }, { winnerId: 1, loserId: 2 }] },
      { ranking: [2, 1], matches: [{ winnerId: 2, loserId: 1 }] },
    ], items);
    // item 1: 2 wins of 3 matches -> 67 (server: Math.round(66.67)); item 2: 2 of 3 as well
    expect(rankings.find(r => r.item.id === 1)!.winPercentage).toBe(67);
    expect(rankings.map(r => r.item.id)).toEqual([2, 1, 3, 4]);
  });

  it('breaks ties by appearances, then id, and skips unknown items', () => {
    const rankings = computeRankings([{ ranking: [4, 3] }, { ranking: [2, 1] }, { ranking: [9, 1] }], items);
    expect(rankings.map(r => r.item.id)).toEqual([2, 4, 1, 3]);
  });
});
