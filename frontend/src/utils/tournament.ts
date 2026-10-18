import type { Item, MatchOutcome } from '@/types';

/**
 * Pure single-elimination tournament engine. Every function returns new state; nothing is
 * mutated, so React can hold the state directly.
 */

/** An entry in a bracket slot; null is a bye. */
export type Entrant = Item | null;

export interface Match {
  a: Entrant;
  b: Entrant;
  winner?: Entrant;
}

export interface TournamentState {
  /** Slots in the first round (a power of two). */
  size: number;
  /** Number of real entries playing. */
  entrantCount: number;
  /** Rounds generated so far; a round is created once the previous one is decided. */
  rounds: Match[][];
  roundIndex: number;
  matchIndex: number;
  complete: boolean;
}

export interface Progress {
  /** Slots in the current round, e.g. 8 for the quarterfinals. */
  roundSize: number;
  /** 1-based position of the current match among this round's real matches. */
  matchNumber: number;
  matchesInRound: number;
  /** Real matches decided so far, and in total (entrants - 1). Byes don't count. */
  played: number;
  total: number;
}

/** Unbiased Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const floorPow2 = (n: number) => 2 ** Math.floor(Math.log2(n));

/**
 * Bracket sizes a player can choose for {@code count} entries: the next power of two (with byes)
 * when count isn't one, then every power of two from count down to 2 (random subsets).
 */
export function bracketSizeOptions(count: number): number[] {
  if (count < 2) return [];
  const floor = floorPow2(count);
  const options = count > floor ? [floor * 2] : [];
  for (let p = floor; p >= 2; p /= 2) options.push(p);
  return options;
}

/** Real matches a run of the given size will have. */
export function realMatchCount(count: number, size: number): number {
  return Math.min(count, size) - 1;
}

const isReal = (e: Entrant | undefined): e is Item => e != null;
const isDecided = (m: Match) => m.winner !== undefined;

/** A match against a bye (or an empty slot) needs no pick. */
function autoResolve(match: Match): Match {
  if (isDecided(match)) return match;
  if (isReal(match.a) && isReal(match.b)) return match;
  return { ...match, winner: isReal(match.a) ? match.a : match.b };
}

/** Moves to the next undecided match, creating later rounds as earlier ones finish. */
function advance(state: TournamentState): TournamentState {
  const rounds = state.rounds.map(r => r.map(autoResolve));
  let roundIndex = state.roundIndex;
  for (;;) {
    const round = rounds[roundIndex];
    const next = round.findIndex(m => !isDecided(m));
    if (next >= 0) {
      return { ...state, rounds, roundIndex, matchIndex: next, complete: false };
    }
    if (round.length === 1) {
      return { ...state, rounds, roundIndex, matchIndex: 0, complete: true };
    }
    const winners = round.map(m => m.winner ?? null);
    const nextRound: Match[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push(autoResolve({ a: winners[i], b: winners[i + 1] }));
    }
    rounds.push(nextRound);
    roundIndex++;
  }
}

/**
 * Starts a tournament. With fewer slots than items, a random subset plays. With more slots,
 * the spare slots become byes, each paired with a real entry (never bye vs bye), and the
 * first round alternates real-vs-real and real-vs-bye matches so bye winners meet match
 * winners in round two.
 */
export function createTournament(items: Item[], size: number, random: () => number = Math.random): TournamentState {
  if (items.length < 2) throw new Error('A tournament needs at least 2 entries');
  if (size < 2 || floorPow2(size) !== size) throw new Error(`Invalid bracket size ${size}`);
  if (!bracketSizeOptions(items.length).includes(size)) {
    throw new Error(`Size ${size} is not available for ${items.length} entries`);
  }

  const entrants = shuffle(items, random).slice(0, size);
  const byes = size - entrants.length;
  let realVsReal = size / 2 - byes;
  let realVsBye = byes;
  const firstRound: Match[] = [];
  let next = 0;
  let pairNext = true;
  while (realVsReal > 0 || realVsBye > 0) {
    if ((pairNext && realVsReal > 0) || realVsBye === 0) {
      firstRound.push({ a: entrants[next++], b: entrants[next++] });
      realVsReal--;
    } else {
      firstRound.push({ a: entrants[next++], b: null });
      realVsBye--;
    }
    pairNext = !pairNext;
  }

  return advance({
    size,
    entrantCount: entrants.length,
    rounds: [firstRound],
    roundIndex: 0,
    matchIndex: 0,
    complete: false,
  });
}

export function currentMatch(state: TournamentState): Match | null {
  return state.complete ? null : state.rounds[state.roundIndex][state.matchIndex] ?? null;
}

/** Records the pick for the current match and moves on (resolving byes automatically). */
export function pick(state: TournamentState, winner: Item): TournamentState {
  const match = currentMatch(state);
  if (!match) throw new Error('The tournament is already complete');
  const chosen = [match.a, match.b].find(e => isReal(e) && e.id === winner.id);
  if (!chosen) throw new Error(`Item ${winner.id} is not in the current match`);

  const rounds = state.rounds.map((round, r) =>
    r !== state.roundIndex ? round : round.map((m, i) => (i === state.matchIndex ? { ...m, winner: chosen } : m)));
  return advance({ ...state, rounds });
}

function loserOf(match: Match): Entrant {
  if (!isDecided(match)) return null;
  return match.winner === match.a ? match.b : match.a;
}

/** Champion first, then runner-up, then losers by round with later rounds first. */
export function finalRanking(state: TournamentState): Item[] {
  if (!state.complete) return [];
  const ranking: Item[] = [];
  const final = state.rounds[state.rounds.length - 1][0];
  if (isReal(final.winner)) ranking.push(final.winner);
  for (let r = state.rounds.length - 1; r >= 0; r--) {
    for (const match of state.rounds[r]) {
      const loser = loserOf(match);
      if (isReal(loser)) ranking.push(loser);
    }
  }
  return ranking;
}

/** The real matches decided so far, as the server expects them. */
export function playedMatches(state: TournamentState): MatchOutcome[] {
  const out: MatchOutcome[] = [];
  for (const round of state.rounds) {
    for (const m of round) {
      if (isReal(m.a) && isReal(m.b) && isReal(m.winner)) {
        out.push({ winnerId: m.winner.id, loserId: m.winner.id === m.a.id ? m.b.id : m.a.id });
      }
    }
  }
  return out;
}

export function progress(state: TournamentState): Progress {
  const round = state.rounds[state.roundIndex];
  const realInRound = round.filter(m => isReal(m.a) && isReal(m.b));
  const before = round.slice(0, state.matchIndex).filter(m => isReal(m.a) && isReal(m.b)).length;
  return {
    roundSize: round.length * 2,
    matchNumber: state.complete ? realInRound.length : before + 1,
    matchesInRound: realInRound.length,
    played: playedMatches(state).length,
    total: state.entrantCount - 1,
  };
}

export function roundName(slots: number): string {
  if (slots === 2) return 'Final';
  if (slots === 4) return 'Semifinals';
  if (slots === 8) return 'Quarterfinals';
  return `Round of ${slots}`;
}
