import type { Item, ItemRanking, MatchOutcome } from '@/types';

export interface RunLike {
  ranking: number[];
  matches?: MatchOutcome[] | null;
}

/** One entry's outcome in a run. Places are 1-based; `placeFrom === placeTo` unless tied. */
export interface Standing {
  itemId: number;
  /** Rounds before the final the entry went out: champion 0, runner-up 1. -1 for legacy runs. */
  depth: number;
  placeFrom: number;
  placeTo: number;
  score: number;
}

export interface ScoredRun {
  /** Champion first, then by depth, then later eliminations first. */
  ranking: number[];
  standings: Map<number, Standing>;
}

/** Rounds in a knockout of n entries: ceil(log2 n). */
export const rounds = (n: number) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));

/**
 * Derives a run's result from its matches (in the order played), exactly like the server's
 * RunScoring: entries knocked out in the same round tie and share one score,
 * (n-1 - (a+b)/2)/(n-1) for a tier on 0-based places a..b. Both are checked against
 * shared/run-scoring-vectors.json. Throws on matches that aren't one knockout.
 */
export function scoreRun(matches: MatchOutcome[]): ScoredRun {
  if (matches.length === 0) throw new Error('A run needs at least one match');
  const entrants: number[] = [];
  const seen = new Set<number>();
  for (const m of matches) {
    for (const id of [m.winnerId, m.loserId]) {
      if (!seen.has(id)) { seen.add(id); entrants.push(id); }
    }
  }
  const n = entrants.length;
  if (matches.length !== n - 1) throw new Error(`A run of ${n} entries must have exactly ${n - 1} matches`);
  const maxRounds = rounds(n);

  const beatenBy = new Map<number, number>();
  const wins = new Map<number, number>();
  const pairs = new Set<string>();
  for (const { winnerId, loserId } of matches) {
    if (winnerId === loserId) throw new Error('An entry cannot play itself');
    const pair = `${Math.min(winnerId, loserId)}:${Math.max(winnerId, loserId)}`;
    if (pairs.has(pair)) throw new Error('Two entries play each other twice');
    pairs.add(pair);
    if (beatenBy.has(loserId)) throw new Error(`Entry ${loserId} loses more than once`);
    beatenBy.set(loserId, winnerId);
    const w = (wins.get(winnerId) ?? 0) + 1;
    if (w > maxRounds) throw new Error(`Entry ${winnerId} has more wins than the bracket has rounds`);
    wins.set(winnerId, w);
  }
  const champion = entrants.find(id => !beatenBy.has(id))!;

  for (const start of entrants) {
    let current = start;
    for (let steps = 0; current !== champion; steps++) {
      if (steps > n) throw new Error('The matches contain a cycle');
      current = beatenBy.get(current)!;
    }
  }

  // Backwards: when W beat L, W's depth is known, and each win W still had to come is one more
  // round L missed.
  const depth = new Map<number, number>([[champion, 0]]);
  const eliminatedAt = new Map<number, number>();
  const winsAfter = new Map<number, number>();
  for (let i = matches.length - 1; i >= 0; i--) {
    const { winnerId, loserId } = matches[i];
    const winnerDepth = depth.get(winnerId);
    if (winnerDepth === undefined) throw new Error('The matches are not in the order they were played');
    const later = winsAfter.get(winnerId) ?? 0;
    winsAfter.set(winnerId, later + 1);
    const loserDepth = winnerDepth + later + 1;
    if (loserDepth > maxRounds) throw new Error(`The matches do not form a bracket of ${n} entries`);
    depth.set(loserId, loserDepth);
    eliminatedAt.set(loserId, i);
  }

  const order = (id: number) => eliminatedAt.get(id) ?? Number.MAX_SAFE_INTEGER;
  const ranking = [...entrants].sort((a, b) => depth.get(a)! - depth.get(b)! || order(b) - order(a));

  const standings = new Map<number, Standing>();
  for (let a = 0; a < n;) {
    const tierDepth = depth.get(ranking[a])!;
    let b = a;
    while (b + 1 < n && depth.get(ranking[b + 1]) === tierDepth) b++;
    const score = n > 1 ? (n - 1 - (a + b) / 2) / (n - 1) : 1;
    for (let i = a; i <= b; i++) {
      standings.set(ranking[i], { itemId: ranking[i], depth: tierDepth, placeFrom: a + 1, placeTo: b + 1, score });
    }
    a = b + 1;
  }
  return { ranking, standings };
}

/** Legacy runs without matches: each entry keeps its list position and (n-1-i)/(n-1). */
export function scoreLegacyRun(ranking: number[]): ScoredRun {
  const n = ranking.length;
  const standings = new Map<number, Standing>();
  ranking.forEach((itemId, i) => {
    standings.set(itemId, { itemId, depth: -1, placeFrom: i + 1, placeTo: i + 1, score: n > 1 ? (n - 1 - i) / (n - 1) : 1 });
  });
  return { ranking: [...ranking], standings };
}

/** The scoring of a stored run: tiers from its matches, or list positions when it has none. */
export function scoreStoredRun(run: RunLike): ScoredRun {
  if (run.matches && run.matches.length > 0) {
    try {
      return scoreRun(run.matches);
    } catch {
      // Accepted under older, looser rules: its stored ranking is all there is.
    }
  }
  return scoreLegacyRun(run.ranking);
}

/** Imaginary runs at 0.5 that shrink an entry's mean towards the middle (server: Leaderboard). */
export const PRIOR_RUNS = 5;

/** The sort score: the mean adjusted for how often the entry has been ranked. */
export const adjustedScore = (scoreSum: number, timesRanked: number) =>
  (scoreSum + 0.5 * PRIOR_RUNS) / (timesRanked + PRIOR_RUNS);

export const winPercentage = (wins: number, matches: number) =>
  (matches > 0 ? Math.round((wins * 100) / matches) : 0);

/**
 * Aggregates runs exactly like the server's item_stats: each run gives an item its tier score,
 * and wins/matches come from the real matches (or, for runs without them, from list position).
 * Sorted like the server's leaderboard (compareRankings).
 */
export function computeRankings(runs: RunLike[], items: Item[]): ItemRanking[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const stats = new Map<number, { score: number; times: number; wins: number; matches: number }>();
  const entry = (id: number) => {
    let s = stats.get(id);
    if (!s) {
      s = { score: 0, times: 0, wins: 0, matches: 0 };
      stats.set(id, s);
    }
    return s;
  };

  for (const run of runs) {
    const scored = scoreStoredRun(run);
    const n = scored.ranking.length;
    scored.ranking.forEach((id, i) => {
      const s = entry(id);
      s.score += scored.standings.get(id)!.score;
      s.times += 1;
      if (!run.matches) {
        s.wins += n - 1 - i;
        s.matches += n - 1;
      }
    });
    for (const m of run.matches ?? []) {
      entry(m.winnerId).wins += 1;
      entry(m.winnerId).matches += 1;
      entry(m.loserId).matches += 1;
    }
  }

  const rankings: ItemRanking[] = [];
  stats.forEach((s, id) => {
    const item = byId.get(id);
    if (!item || s.times === 0) return;
    rankings.push({
      item,
      wins: s.wins,
      totalMatches: s.matches,
      winPercentage: winPercentage(s.wins, s.matches),
      score: adjustedScore(s.score, s.times),
      averageScore: s.score / s.times,
      timesRanked: s.times,
    });
  });
  return rankings.sort(compareRankings);
}

/** score desc, winPercentage desc, timesRanked desc, item id asc (server: Leaderboard.ORDER). */
export function compareRankings(a: ItemRanking, b: ItemRanking): number {
  return b.score - a.score
    || b.winPercentage - a.winPercentage
    || b.timesRanked - a.timesRanked
    || a.item.id - b.item.id;
}

/** "3rd", or "5th–8th" for entries tied in a run. */
export function placeLabel(from: number, to: number): string {
  const ordinal = (n: number) => {
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
    return `${n}${suffix}`;
  };
  return from === to ? ordinal(from) : `${ordinal(from)}–${ordinal(to)}`;
}

/**
 * A fallback for how many runs a ranking rests on, while the exact count (bracket stats) is
 * loading or failed. Smaller runs play a random subset, so the most-ranked item gives a lower
 * bound; when items differ the count is reported as "at least".
 */
export function rankingRunCount(rankings: ItemRanking[]): { runs: number; atLeast: boolean } {
  if (rankings.length === 0) return { runs: 0, atLeast: false };
  const counts = rankings.map(r => r.timesRanked);
  const runs = Math.max(...counts);
  return { runs, atLeast: Math.min(...counts) !== runs };
}

export function runsLabel({ runs, atLeast }: { runs: number; atLeast: boolean }): string {
  return `${atLeast ? 'at least ' : ''}${runs} ${runs === 1 ? 'run' : 'runs'}`;
}

/** A score shown to people, on a 0-100 scale. */
export const displayScore = (score: number) => Math.round(score * 100);
