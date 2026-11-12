package com.bracketbattle.scoring;

import com.bracketbattle.dto.ItemRankingDto;

import java.util.Comparator;

/**
 * Leaderboard order, shared by everyone's ranking and (mirrored in rankings.ts) a player's own.
 * Both test suites check shared/leaderboard-vectors.json.
 *
 * <p>Smaller runs play random subsets, so entries are ranked different numbers of times; the raw
 * mean would put an entry that appeared once and won (1.00) above one at 0.93 over 500 runs. The
 * sort score is therefore the mean shrunk towards the middle by {@link #PRIOR_RUNS} imaginary runs
 * at 0.5: {@code (scoreSum + 0.5 K) / (timesRanked + K)}. It moves little once an entry has been
 * ranked a few dozen times.
 */
public final class Leaderboard {

    public static final int PRIOR_RUNS = 5;
    private static final double PRIOR_SCORE = 0.5;

    /** score desc, winPercentage desc, timesRanked desc, item id asc. */
    public static final Comparator<ItemRankingDto> ORDER =
            Comparator.comparingDouble(ItemRankingDto::getScore).reversed()
                    .thenComparing(Comparator.comparingInt(ItemRankingDto::getWinPercentage).reversed())
                    .thenComparing(Comparator.comparingInt(ItemRankingDto::getTimesRanked).reversed())
                    .thenComparing(r -> r.getItem().getId());

    private Leaderboard() {}

    public static double adjustedScore(double scoreSum, long timesRanked) {
        return (scoreSum + PRIOR_SCORE * PRIOR_RUNS) / (timesRanked + PRIOR_RUNS);
    }

    public static int winPercentage(long wins, long matches) {
        return matches > 0 ? (int) Math.round(wins * 100.0 / matches) : 0;
    }
}
