package com.bracketbattle.repository;

import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.MatchOutcome;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Incremental per-item aggregates behind the leaderboard. Each submitted run adds to the rows of
 * the items it ranked, in the same transaction as the result insert, so reading the leaderboard
 * is one indexed query instead of a recomputation over every result.
 */
@Repository
public class ItemStatsRepository {

    /** Leaderboard order: averageScore desc, winPercentage desc, timesRanked desc, item id asc. */
    public static final Comparator<ItemRankingDto> RANKING_ORDER =
            Comparator.comparingDouble(ItemRankingDto::getAverageScore).reversed()
                    .thenComparing(Comparator.comparingInt(ItemRankingDto::getWinPercentage).reversed())
                    .thenComparing(Comparator.comparingInt(ItemRankingDto::getTimesRanked).reversed())
                    .thenComparing(r -> r.getItem().getId());

    private static final String UPSERT = """
            INSERT INTO item_stats (item_id, bracket_id, times_ranked, score_sum, wins, matches)
            VALUES (?, ?, 1, ?, ?, ?)
            ON CONFLICT (item_id) DO UPDATE SET
                times_ranked = item_stats.times_ranked + 1,
                score_sum = item_stats.score_sum + EXCLUDED.score_sum,
                wins = item_stats.wins + EXCLUDED.wins,
                matches = item_stats.matches + EXCLUDED.matches
            """;

    private final JdbcTemplate jdbc;

    public ItemStatsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** What one run adds to one item's row. */
    public record Delta(double score, long wins, long matches) {}

    /**
     * Per-item contributions of one run, keyed (and therefore sorted) by item id. The position
     * score is normalised, (n-1-i)/(n-1), so runs of different sizes are comparable: 1.0 is the
     * champion and 0.0 is last. Wins and matches come from the real match outcomes; legacy runs
     * without them fall back to list position.
     */
    public static Map<Long, Delta> deltas(List<Long> ranking, List<MatchOutcome> matches) {
        int n = ranking.size();
        Map<Long, long[]> played = new TreeMap<>();
        if (matches != null) {
            for (MatchOutcome m : matches) {
                long[] winner = played.computeIfAbsent(m.winnerId(), k -> new long[2]);
                winner[0]++;
                winner[1]++;
                played.computeIfAbsent(m.loserId(), k -> new long[2])[1]++;
            }
        }
        Map<Long, Delta> result = new TreeMap<>();
        for (int i = 0; i < n; i++) {
            Long itemId = ranking.get(i);
            double score = n > 1 ? (double) (n - 1 - i) / (n - 1) : 1.0;
            if (matches != null) {
                long[] counts = played.getOrDefault(itemId, new long[2]);
                result.put(itemId, new Delta(score, counts[0], counts[1]));
            } else {
                result.put(itemId, new Delta(score, n - 1 - i, n - 1));
            }
        }
        return result;
    }

    /**
     * Adds one run to the aggregates. Rows are upserted in item-id order so concurrent
     * submissions to the same bracket lock rows in the same order and cannot deadlock.
     */
    public void applyRun(Long bracketId, List<Long> ranking, List<MatchOutcome> matches) {
        List<Object[]> rows = new ArrayList<>();
        deltas(ranking, matches).forEach((itemId, d) ->
                rows.add(new Object[]{itemId, bracketId, d.score(), d.wins(), d.matches()}));
        jdbc.batchUpdate(UPSERT, rows);
    }

    public List<ItemRankingDto> findRankings(Long bracketId) {
        List<ItemRankingDto> rankings = jdbc.query("""
                SELECT i.id, i.bracket_id, i.title, i.media_url, i.media_type,
                       s.times_ranked, s.score_sum, s.wins, s.matches
                FROM item_stats s JOIN items i ON i.id = s.item_id
                WHERE s.bracket_id = ? AND s.times_ranked > 0
                """, (rs, rowNum) -> {
            Item item = new Item(rs.getLong("bracket_id"), rs.getString("title"),
                    rs.getString("media_url"), rs.getString("media_type"));
            item.setId(rs.getLong("id"));
            int timesRanked = rs.getInt("times_ranked");
            long wins = rs.getLong("wins");
            long matches = rs.getLong("matches");
            return new ItemRankingDto(item, wins, matches, winPercentage(wins, matches),
                    rs.getDouble("score_sum") / timesRanked, timesRanked);
        }, bracketId);
        rankings.sort(RANKING_ORDER);
        return rankings;
    }

    public static int winPercentage(long wins, long matches) {
        return matches > 0 ? (int) Math.round(wins * 100.0 / matches) : 0;
    }
}
