import type { Item } from '@/types';
import { session } from './storage';
import { currentMatch, layoutTournament, pick, playedMatches, type TournamentState } from './tournament';

/**
 * A run in progress, kept per bracket in sessionStorage so a reload, a back-swipe or a discarded
 * mobile tab doesn't lose it. Only the server's ticket, its entrants and the picks made are
 * stored; the tournament is rebuilt by replaying the picks, so a stored run that doesn't fit the
 * bracket any more is simply dropped.
 */
export interface SavedRun {
  ticket: string;
  size: number;
  /** In seeding order, as the server sent them. */
  entrantIds: number[];
  /** The winner of each real match, in the order they were played. */
  picks: number[];
  /** When the ticket was issued (ms since the epoch). */
  startedAt: number;
}

/** Tickets are good for 12 hours (RunTickets.MAX_AGE); older runs couldn't be saved anyway. */
export const SAVED_RUN_MAX_AGE_MS = 11.5 * 60 * 60 * 1000;

const key = (bracketId: number) => `duely:run:${bracketId}`;

const isIdList = (x: unknown): x is number[] => Array.isArray(x) && x.every(n => Number.isInteger(n));

export function saveRun(bracketId: number, run: SavedRun): void {
  session.set(key(bracketId), JSON.stringify(run));
}

export function clearSavedRun(bracketId: number): void {
  session.remove(key(bracketId));
}

/** The stored run for this bracket, unless it is missing, malformed or too old to save. */
export function loadSavedRun(bracketId: number, now = Date.now()): SavedRun | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(session.get(key(bracketId)) ?? 'null');
  } catch {
    parsed = null;
  }
  const run = parsed as Partial<SavedRun> | null;
  const valid = run !== null && typeof run === 'object'
    && typeof run.ticket === 'string' && Number.isInteger(run.size)
    && isIdList(run.entrantIds) && isIdList(run.picks)
    && typeof run.startedAt === 'number' && now - run.startedAt < SAVED_RUN_MAX_AGE_MS;
  if (!valid) {
    if (parsed !== null) clearSavedRun(bracketId);
    return null;
  }
  return run as SavedRun;
}

/** The picks a tournament records, for {@link SavedRun.picks}. */
export function picksOf(state: TournamentState): number[] {
  return playedMatches(state).map(m => m.winnerId);
}

/** Rebuilds the tournament a saved run describes, or null if its entries or picks don't fit. */
export function restoreTournament(run: SavedRun, items: Item[]): TournamentState | null {
  const byId = new Map(items.map(item => [item.id, item]));
  const entrants = run.entrantIds.map(id => byId.get(id));
  if (entrants.some(e => !e)) return null;
  try {
    let state = layoutTournament(entrants as Item[], run.size);
    for (const winnerId of run.picks) {
      const match = currentMatch(state);
      const winner = [match?.a, match?.b].find(e => e?.id === winnerId);
      if (!match?.a || !match.b || !winner) return null;
      state = pick(state, winner);
    }
    return state;
  } catch {
    return null;
  }
}
