import { afterEach, describe, expect, it } from 'vitest';
import type { Item } from '@/types';
import { clearSavedRun, loadSavedRun, picksOf, restoreTournament, SAVED_RUN_MAX_AGE_MS, saveRun, type SavedRun } from './runProgress';
import { currentMatch, layoutTournament, pick, type TournamentState } from './tournament';

const items: Item[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1, bracketId: 9, title: `Entry ${i + 1}`, mediaUrl: `https://img.example/${i}.png`, mediaType: 'image',
}));

/** Plays n matches, always picking side a. */
function play(state: TournamentState, n: number): TournamentState {
  let s = state;
  for (let i = 0; i < n; i++) {
    const m = currentMatch(s);
    if (!m?.a) throw new Error('no match');
    s = pick(s, m.a);
  }
  return s;
}

const run = (fields: Partial<SavedRun> = {}): SavedRun => ({
  ticket: 't', size: 8, entrantIds: [3, 1, 6, 2, 5], picks: [], startedAt: Date.now(), ...fields,
});

afterEach(() => window.sessionStorage.clear());

describe('saved runs', () => {
  it('round-trip per bracket and can be cleared', () => {
    saveRun(9, run({ picks: [3] }));
    expect(loadSavedRun(9)?.picks).toEqual([3]);
    expect(loadSavedRun(10)).toBeNull();
    clearSavedRun(9);
    expect(loadSavedRun(9)).toBeNull();
  });

  it('drops runs whose ticket has expired, and malformed ones', () => {
    saveRun(9, run({ startedAt: Date.now() - SAVED_RUN_MAX_AGE_MS - 1 }));
    expect(loadSavedRun(9)).toBeNull();
    expect(window.sessionStorage.getItem('duely:run:9')).toBeNull();

    window.sessionStorage.setItem('duely:run:9', '{"ticket": 5}');
    expect(loadSavedRun(9)).toBeNull();
    window.sessionStorage.setItem('duely:run:9', 'not json');
    expect(loadSavedRun(9)).toBeNull();
  });
});

describe('restoreTournament', () => {
  it('replays the picks into the same tournament', () => {
    const entrants = [3, 1, 6, 2, 5].map(id => items[id - 1]);
    const played = play(layoutTournament(entrants, 8), 2);
    const restored = restoreTournament(run({ picks: picksOf(played) }), items);
    expect(restored).toEqual(played);

    const finished = play(played, 2);
    expect(finished.complete).toBe(true);
    expect(restoreTournament(run({ picks: picksOf(finished) }), items)).toEqual(finished);
  });

  it('gives up on entries the bracket no longer has, or picks that do not fit', () => {
    expect(restoreTournament(run({ entrantIds: [3, 1, 99, 2, 5] }), items)).toBeNull();
    expect(restoreTournament(run({ picks: [4] }), items)).toBeNull();
    expect(restoreTournament(run({ size: 4 }), items)).toBeNull();
    expect(restoreTournament(run({ picks: [3, 6, 5, 3, 3] }), items)).toBeNull();
  });
});
