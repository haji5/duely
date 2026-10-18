import type { Item, ItemRanking, MatchOutcome } from '@/types';

export interface RunLike {
  ranking: number[];
  matches?: MatchOutcome[] | null;
}

/**
 * Aggregates runs exactly like the server's item_stats: each run gives an item the normalised
 * position score (n-1-i)/(n-1), and wins/matches come from the real matches (or, for runs
 * without them, from list position). Sorted by averageScore, winPercentage, timesRanked, id.
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
    const n = run.ranking.length;
    run.ranking.forEach((id, i) => {
      const s = entry(id);
      s.score += n > 1 ? (n - 1 - i) / (n - 1) : 1;
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
      winPercentage: s.matches > 0 ? Math.round((s.wins * 100) / s.matches) : 0,
      averageScore: s.score / s.times,
      timesRanked: s.times,
    });
  });
  return rankings.sort(compareRankings);
}

export function compareRankings(a: ItemRanking, b: ItemRanking): number {
  return b.averageScore - a.averageScore
    || b.winPercentage - a.winPercentage
    || b.timesRanked - a.timesRanked
    || a.item.id - b.item.id;
}
