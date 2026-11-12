package com.bracketbattle.scoring;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.model.MatchOutcome;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Derives a run's result from its matches alone: who won, how far everyone got, and the score each
 * entry earns. Mirrored by scoreRun in frontend/src/utils/rankings.ts; both test suites check
 * shared/run-scoring-vectors.json.
 *
 * <p>An entry's <em>depth</em> is how many rounds before the final it went out (champion 0,
 * runner-up 1). In a knockout everyone knocked out in the same round achieved the same thing, so
 * entries of equal depth form a tier and share one score: a tier occupying 0-based places
 * {@code a..b} of {@code n} scores {@code (n-1 - (a+b)/2) / (n-1)}. The champion scores 1.0 and
 * all first-round losers share the lowest score, instead of being spread from 0.49 to 0.00 by the
 * order their matches happened to be listed in.
 */
public final class RunScoring {

    private RunScoring() {}

    /** One entry's outcome. Places are 1-based; {@code from == to} unless the entry is tied. */
    public record Standing(long itemId, int depth, int placeFrom, int placeTo, double score) {}

    /**
     * @param ranking   entries by depth, then by elimination order (later first): the champion,
     *                  the runner-up, the semifinal losers, ...
     * @param standings keyed by item id
     */
    public record Scored(List<Long> ranking, Map<Long, Standing> standings) {
        public int size() {
            return ranking.size();
        }
    }

    /** Rounds in a knockout of {@code n} entries: ceil(log2 n). */
    public static int rounds(int n) {
        return n <= 1 ? 0 : 32 - Integer.numberOfLeadingZeros(n - 1);
    }

    /**
     * Validates {@code matches} (in the order played) as one single-elimination tournament and
     * scores it.
     *
     * @throws InvalidRequestException if the matches are not the real games of a knockout
     */
    public static Scored score(List<MatchOutcome> matches) {
        if (matches == null || matches.isEmpty()) {
            throw new InvalidRequestException("A run needs at least one match");
        }
        Set<Long> entrants = new LinkedHashSet<>();
        for (MatchOutcome m : matches) {
            entrants.add(m.winnerId());
            entrants.add(m.loserId());
        }
        int n = entrants.size();
        if (matches.size() != n - 1) {
            throw new InvalidRequestException("A run of " + n + " entries must have exactly " + (n - 1) + " matches");
        }
        int rounds = rounds(n);

        Map<Long, Long> beatenBy = new HashMap<>();
        Map<Long, Integer> wins = new HashMap<>();
        Set<String> pairs = new HashSet<>();
        for (MatchOutcome m : matches) {
            long winner = m.winnerId();
            long loser = m.loserId();
            if (winner == loser) {
                throw new InvalidRequestException("An entry cannot play itself");
            }
            if (!pairs.add(Math.min(winner, loser) + ":" + Math.max(winner, loser))) {
                throw new InvalidRequestException("Entries " + winner + " and " + loser + " play each other twice");
            }
            if (beatenBy.putIfAbsent(loser, winner) != null) {
                throw new InvalidRequestException("Entry " + loser + " loses more than once");
            }
            if (wins.merge(winner, 1, Integer::sum) > rounds) {
                throw new InvalidRequestException("Entry " + winner + " has more wins than a bracket of " + n + " has rounds");
            }
        }
        // n-1 distinct losers among n entries: exactly one entry never loses.
        long champion = entrants.stream().filter(id -> !beatenBy.containsKey(id)).findFirst().orElseThrow();

        // Following "was beaten by" from every entry must reach the champion; otherwise some
        // entries beat each other in a circle.
        for (long start : entrants) {
            long current = start;
            for (int steps = 0; current != champion; steps++) {
                if (steps > n) {
                    throw new InvalidRequestException("The matches contain a cycle: entry " + start + " never traces back to the champion");
                }
                current = beatenBy.get(current);
            }
        }

        // Walk the matches backwards: when W beat L, W's own depth is already known (W went out
        // later, or is the champion), and every win W still had to come is one more round L
        // missed. Byes only exist in round one, so this counts rounds before the final exactly.
        Map<Long, Integer> depth = new HashMap<>();
        Map<Long, Integer> eliminatedAt = new HashMap<>();
        Map<Long, Integer> winsAfter = new HashMap<>();
        depth.put(champion, 0);
        for (int i = matches.size() - 1; i >= 0; i--) {
            MatchOutcome m = matches.get(i);
            Integer winnerDepth = depth.get(m.winnerId());
            if (winnerDepth == null) {
                throw new InvalidRequestException("The matches are not in the order they were played");
            }
            int later = winsAfter.merge(m.winnerId(), 1, Integer::sum) - 1;
            int loserDepth = winnerDepth + later + 1;
            if (loserDepth > rounds) {
                throw new InvalidRequestException("The matches do not form a bracket of " + n + " entries");
            }
            depth.put(m.loserId(), loserDepth);
            eliminatedAt.put(m.loserId(), i);
        }

        List<Long> ranking = new ArrayList<>(entrants);
        ranking.sort(Comparator.<Long>comparingInt(depth::get)
                .thenComparing(id -> eliminatedAt.getOrDefault(id, Integer.MAX_VALUE), Comparator.reverseOrder()));

        Map<Long, Standing> standings = new LinkedHashMap<>();
        int a = 0;
        while (a < n) {
            int tierDepth = depth.get(ranking.get(a));
            int b = a;
            while (b + 1 < n && depth.get(ranking.get(b + 1)) == tierDepth) b++;
            double score = n > 1 ? (n - 1 - (a + b) / 2.0) / (n - 1) : 1.0;
            for (int i = a; i <= b; i++) {
                long id = ranking.get(i);
                standings.put(id, new Standing(id, tierDepth, a + 1, b + 1, score));
            }
            a = b + 1;
        }
        return new Scored(List.copyOf(ranking), standings);
    }

    /**
     * Legacy runs saved before matches were recorded: the stored list position is all there is,
     * so each entry keeps its own place and the position score {@code (n-1-i)/(n-1)}.
     */
    public static Scored legacy(List<Long> ranking) {
        int n = ranking.size();
        Map<Long, Standing> standings = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            long id = ranking.get(i);
            standings.put(id, new Standing(id, -1, i + 1, i + 1, n > 1 ? (double) (n - 1 - i) / (n - 1) : 1.0));
        }
        return new Scored(List.copyOf(ranking), standings);
    }
}
