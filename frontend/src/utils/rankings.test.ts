import { describe, expect, it } from 'vitest';
import type { Item, ItemRanking, MatchOutcome } from '@/types';
import {
  adjustedScore, compareRankings, computeRankings, displayScore, placeLabel, PRIOR_RUNS, rankingRunCount, runsLabel,
  scoreRun, scoreStoredRun, winPercentage,
} from './rankings';
import { readSharedFixture } from './sharedFixtures';

const item = (id: number): Item => ({ id, bracketId: 1, title: `#${id}`, mediaUrl: 'https://x.test', mediaType: 'image' });
const items = [1, 2, 3, 4].map(item);
const m = (winnerId: number, loserId: number): MatchOutcome => ({ winnerId, loserId });

interface Vectors {
  valid: {
    name: string; matches: MatchOutcome[]; ranking: number[];
    depths: Record<string, number>; places: Record<string, { from: number; to: number }>; scores: Record<string, number>;
  }[];
  invalid: { name: string; matches: MatchOutcome[] }[];
}

describe('scoreRun (shared/run-scoring-vectors.json, also checked by RunScoringTest)', () => {
  const vectors = readSharedFixture<Vectors>('run-scoring-vectors.json');

  for (const c of vectors.valid) {
    it(`scores ${c.name}`, () => {
      const scored = scoreRun(c.matches);
      expect(scored.ranking).toEqual(c.ranking);
      for (const id of c.ranking) {
        const s = scored.standings.get(id)!;
        expect(s.depth).toBe(c.depths[id]);
        expect({ from: s.placeFrom, to: s.placeTo }).toEqual(c.places[id]);
        expect(s.score).toBeCloseTo(c.scores[id], 12);
      }
    });
  }

  for (const c of vectors.invalid) {
    it(`rejects ${c.name}`, () => {
      expect(() => scoreRun(c.matches)).toThrow();
    });
  }

  it('gives the four first-round losers of an eight-entry run one score', () => {
    const eight = vectors.valid.find(c => c.matches.length === 7)!;
    const scores = new Set([...scoreRun(eight.matches).standings.values()].filter(s => s.depth === 3).map(s => s.score));
    expect([...scores]).toEqual([(7 - 5.5) / 7]);
  });
});

describe('leaderboard order (shared/leaderboard-vectors.json, also checked by LeaderboardTest)', () => {
  it('sorts by the adjusted score, then win rate, appearances and id', () => {
    const vectors = readSharedFixture<{
      k: number;
      rows: { itemId: number; timesRanked: number; scoreSum: number; wins: number; matches: number }[];
      expected: { itemId: number; score: number; averageScore: number; winPercentage: number }[];
    }>('leaderboard-vectors.json');
    expect(PRIOR_RUNS).toBe(vectors.k);
    const rows: ItemRanking[] = vectors.rows.map(r => ({
      item: item(r.itemId),
      wins: r.wins,
      totalMatches: r.matches,
      winPercentage: winPercentage(r.wins, r.matches),
      score: adjustedScore(r.scoreSum, r.timesRanked),
      averageScore: r.scoreSum / r.timesRanked,
      timesRanked: r.timesRanked,
    })).sort(compareRankings);
    expect(rows.map(r => r.item.id)).toEqual(vectors.expected.map(e => e.itemId));
    rows.forEach((r, i) => {
      expect(r.score).toBeCloseTo(vectors.expected[i].score, 12);
      expect(r.averageScore).toBeCloseTo(vectors.expected[i].averageScore, 12);
      expect(r.winPercentage).toBe(vectors.expected[i].winPercentage);
    });
  });
});

describe('computeRankings', () => {
  it('matches the server (same runs as the backend integration test)', () => {
    const rankings = computeRankings([
      { ranking: [1, 2, 3, 4], matches: [m(1, 3), m(2, 4), m(1, 2)] },
      { ranking: [2, 1, 4, 3], matches: [m(1, 3), m(2, 4), m(2, 1)] },
      { ranking: [1, 3], matches: [m(1, 3)] },
    ], items);

    expect(rankings.map(r => r.item.id)).toEqual([1, 2, 4, 3]);
    expect(rankings[0]).toMatchObject({ wins: 4, totalMatches: 5, winPercentage: 80, timesRanked: 3 });
    expect(rankings[0].averageScore).toBeCloseTo((1 + 2 / 3 + 1) / 3, 12);
    expect(rankings[0].score).toBeCloseTo((1 + 2 / 3 + 1 + 2.5) / 8, 12);
    expect(rankings[1]).toMatchObject({ wins: 3, totalMatches: 4, winPercentage: 75, timesRanked: 2 });
    // Both semifinal losers share 1/6 in a run of four.
    expect(rankings[2].averageScore).toBeCloseTo(1 / 6, 12);
    expect(rankings[3].averageScore).toBeCloseTo(1 / 9, 12);
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
    expect(computeRankings([{ ranking: [1, 2], matches: [m(1, 2)] }], [])).toEqual([]);
  });

  it('treats an empty match list as "no matches", not as a legacy run', () => {
    // Server: matches != null means real matches, even when the list is empty.
    const [top] = computeRankings([{ ranking: [1, 2], matches: [] }], items);
    expect(top).toMatchObject({ wins: 0, totalMatches: 0, winPercentage: 0, averageScore: 1 });
  });

  it('mixes legacy and modern runs', () => {
    const rankings = computeRankings([
      { ranking: [1, 2], matches: null },
      { ranking: [2, 1], matches: [m(2, 1)] },
    ], items);
    const one = rankings.find(r => r.item.id === 1)!;
    expect(one).toMatchObject({ wins: 1, totalMatches: 2, winPercentage: 50, timesRanked: 2 });
    expect(one.averageScore).toBeCloseTo(0.5, 12);
  });

  it('rounds win percentages like the server (Math.round, half up)', () => {
    const rankings = computeRankings([
      { ranking: [1, 2, 3, 4], matches: [m(1, 3), m(2, 4), m(1, 2)] },
      { ranking: [2, 1], matches: [m(2, 1)] },
    ], items);
    // item 1: 2 wins of 3 matches -> 67 (server: Math.round(66.67)); item 2: 2 of 3 as well
    expect(rankings.find(r => r.item.id === 1)!.winPercentage).toBe(67);
    expect(rankings.map(r => r.item.id)).toEqual([2, 1, 3, 4]);
  });

  it('breaks ties by appearances, then id, and skips unknown items', () => {
    // 2 and 4 each won their only run: equal in every way, so the lower id goes first. 3 and 1
    // both average 0, but 1 lost twice, which is more evidence it is weak.
    const rankings = computeRankings([{ ranking: [4, 3] }, { ranking: [2, 1] }, { ranking: [9, 1] }], items);
    expect(rankings.map(r => r.item.id)).toEqual([2, 4, 3, 1]);
  });

  it('keeps a lucky single run below a long good record', () => {
    expect(adjustedScore(1, 1)).toBeLessThan(adjustedScore(465, 500));
  });
});

describe('scoreStoredRun', () => {
  it('uses tiers when the matches score, and list positions otherwise', () => {
    expect(scoreStoredRun({ ranking: [1, 2, 3, 4], matches: [m(1, 3), m(2, 4), m(1, 2)] }).standings.get(4)!.placeFrom).toBe(3);
    // Accepted under older rules but not one knockout by today's: fall back to the stored order.
    const legacy = scoreStoredRun({ ranking: [1, 2, 3, 4], matches: [m(1, 2), m(1, 3), m(2, 4)] });
    expect(legacy.ranking).toEqual([1, 2, 3, 4]);
    expect(legacy.standings.get(4)!.score).toBe(0);
  });
});

describe('placeLabel', () => {
  it('names single and shared places', () => {
    expect(placeLabel(1, 1)).toBe('1st');
    expect(placeLabel(2, 2)).toBe('2nd');
    expect(placeLabel(3, 4)).toBe('3rd–4th');
    expect(placeLabel(5, 8)).toBe('5th–8th');
    expect(placeLabel(11, 13)).toBe('11th–13th');
    expect(placeLabel(21, 22)).toBe('21st–22nd');
  });
});

describe('rankingRunCount', () => {
  it('is exact when every item was in every run', () => {
    const count = rankingRunCount(computeRankings([{ ranking: [1, 2, 3, 4] }, { ranking: [4, 3, 2, 1] }], items));
    expect(count).toEqual({ runs: 2, atLeast: false });
    expect(runsLabel(count)).toBe('2 runs');
  });

  it('is a lower bound when smaller runs left items out', () => {
    const count = rankingRunCount(computeRankings([{ ranking: [1, 2, 3, 4] }, { ranking: [1, 3] }], items));
    expect(count).toEqual({ runs: 2, atLeast: true });
    expect(runsLabel(count)).toBe('at least 2 runs');
  });

  it('handles no runs and one run', () => {
    expect(rankingRunCount([])).toEqual({ runs: 0, atLeast: false });
    expect(runsLabel({ runs: 1, atLeast: false })).toBe('1 run');
  });
});

describe('displayScore', () => {
  it('shows a score on a 0-100 scale', () => {
    expect(displayScore(1)).toBe(100);
    expect(displayScore(0.7419)).toBe(74);
    expect(displayScore(0)).toBe(0);
  });
});
