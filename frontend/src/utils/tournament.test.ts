import { describe, expect, it } from 'vitest';
import type { Item } from '@/types';
import {
  bracketSizeOptions, createTournament, currentMatch, finalRanking, pick, playedMatches, progress,
  realMatchCount, roundName, shuffle, TournamentState,
} from './tournament';

const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, bracketId: 1, title: `Item ${i + 1}`, mediaUrl: 'https://x.test', mediaType: 'image' }));

/** Deterministic PRNG (mulberry32) for reproducible "random" picks. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playOut(state: TournamentState, random: () => number) {
  let s = state;
  let picks = 0;
  for (let m = currentMatch(s); m; m = currentMatch(s)) {
    expect(m.a).not.toBeNull();
    expect(m.b).not.toBeNull();
    const winner = random() < 0.5 ? m.a! : m.b!;
    s = pick(s, winner);
    picks++;
  }
  return { state: s, picks };
}

describe('bracketSizeOptions', () => {
  it('offers the next power of two first when byes are needed', () => {
    expect(bracketSizeOptions(5)).toEqual([8, 4, 2]);
    expect(bracketSizeOptions(8)).toEqual([8, 4, 2]);
    expect(bracketSizeOptions(9)).toEqual([16, 8, 4, 2]);
    expect(bracketSizeOptions(2)).toEqual([2]);
    expect(bracketSizeOptions(1)).toEqual([]);
  });

  it('counts only real matches', () => {
    expect(realMatchCount(9, 16)).toBe(8);
    expect(realMatchCount(9, 4)).toBe(3);
  });
});

describe('createTournament / pick / finalRanking', () => {
  for (let n = 2; n <= 20; n++) {
    for (const size of bracketSizeOptions(n)) {
      it(`plays ${n} entries at size ${size} correctly`, () => {
        const random = seeded(n * 100 + size);
        const items = makeItems(n);
        const start = createTournament(items, size, random);
        const entrants = Math.min(n, size);

        // Every bye faces a real entry
        for (const m of start.rounds[0]) {
          expect(m.a === null && m.b === null).toBe(false);
        }

        const { state, picks } = playOut(start, random);
        expect(state.complete).toBe(true);
        expect(picks).toBe(entrants - 1);

        const ranking = finalRanking(state);
        expect(ranking).toHaveLength(entrants);
        expect(new Set(ranking.map(i => i.id)).size).toBe(entrants);
        const final = state.rounds[state.rounds.length - 1][0];
        expect(ranking[0]).toBe(final.winner);

        const matches = playedMatches(state);
        expect(matches).toHaveLength(entrants - 1);
        const losers = new Set(matches.map(m => m.loserId));
        expect(losers.size).toBe(entrants - 1);
        expect(losers.has(ranking[0].id)).toBe(false);

        // No entry gets more than one free round: reaching round r takes at least r - 1 wins.
        const wins = new Map<number, number>();
        matches.forEach(m => wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1));
        state.rounds.forEach((round, r) => {
          for (const m of round) {
            for (const e of [m.a, m.b]) {
              if (e) expect(wins.get(e.id) ?? 0).toBeGreaterThanOrEqual(r - 1);
            }
          }
        });
      });
    }
  }

  it('pairs byes with real entries (5 at size 8: one real match, three byes)', () => {
    const state = createTournament(makeItems(5), 8, seeded(1));
    const first = state.rounds[0];
    expect(first.filter(m => m.a && m.b)).toHaveLength(1);
    expect(first.filter(m => m.b === null)).toHaveLength(3);
    // Round two is already partly known: bye winners meet each other or the match winner
    expect(progress(state)).toMatchObject({ roundSize: 8, matchNumber: 1, matchesInRound: 1, played: 0, total: 4 });
  });

  it('never mutates the previous state', () => {
    const start = createTournament(makeItems(4), 4, seeded(2));
    const snapshot = JSON.stringify(start);
    const m = currentMatch(start)!;
    pick(start, m.a!);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('rejects a pick that is not in the current match', () => {
    const start = createTournament(makeItems(4), 4, seeded(3));
    const m = currentMatch(start)!;
    const outsider = makeItems(4).find(i => i.id !== m.a!.id && i.id !== m.b!.id)!;
    expect(() => pick(start, outsider)).toThrow();
  });

  it('orders losers by round, later rounds first', () => {
    const { state } = playOut(createTournament(makeItems(8), 8, seeded(4)), seeded(5));
    const ranking = finalRanking(state).map(i => i.id);
    const roundOf = (id: number) => state.rounds.findIndex(r => r.some(m => m.winner && m.winner.id !== id && (m.a?.id === id || m.b?.id === id)));
    const rounds = ranking.slice(1).map(roundOf);
    expect(rounds).toEqual([...rounds].sort((a, b) => b - a));
  });

  it('uses a random subset when the size is smaller than the entry count', () => {
    const state = createTournament(makeItems(10), 4, seeded(6));
    expect(state.entrantCount).toBe(4);
    expect(state.rounds[0].flatMap(m => [m.a, m.b]).every(e => e !== null)).toBe(true);
  });

  it('rejects impossible sizes', () => {
    expect(() => createTournament(makeItems(5), 16)).toThrow();
    expect(() => createTournament(makeItems(5), 6)).toThrow();
    expect(() => createTournament(makeItems(1), 2)).toThrow();
  });
});

describe('shuffle', () => {
  it('is deterministic for a seeded random source and keeps every element', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(xs, seeded(42))).toEqual(shuffle(xs, seeded(42)));
    expect([...shuffle(xs, seeded(7))].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is roughly uniform', () => {
    const random = seeded(99);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[shuffle([0, 1, 2], random)[0]]++;
    counts.forEach(c => expect(c / 30000).toBeCloseTo(1 / 3, 1));
  });
});

describe('roundName', () => {
  it('names rounds by slot count', () => {
    expect(roundName(2)).toBe('Final');
    expect(roundName(4)).toBe('Semifinals');
    expect(roundName(8)).toBe('Quarterfinals');
    expect(roundName(16)).toBe('Round of 16');
  });
});
