package com.bracketbattle.repository;

import com.bracketbattle.dto.ItemDto;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.scoring.Leaderboard;
import com.bracketbattle.scoring.RunScoring;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Per-item aggregates behind the leaderboard. Each counted run adds to the rows of the items it
 * ranked, in the same transaction as the result insert, so reading the leaderboard is one indexed
 * query instead of a recomputation over every result. {@code StatsService.rebuild} recomputes a
 * bracket's rows from its results.
 *
 * <p>Both paths take a per-bracket advisory lock keyed on the bracket id: shared for adding a run
 * (concurrent runs still proceed together; row locks order them), exclusive for a rebuild, so a
 * rebuild never interleaves with a submission. No other code uses advisory locks.
 */
@Repository
public class ItemStatsRepository {

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

    /** One item's aggregate row. */
    public record Totals(long timesRanked, double scoreSum, long wins, long matches) {
        public static final Totals EMPTY = new Totals(0, 0.0, 0, 0);

        public Totals plus(Delta d) {
            return new Totals(timesRanked + 1, scoreSum + d.score(), wins + d.wins(), matches + d.matches());
        }
    }

    /**
     * Per-item contributions of one run, keyed (and therefore sorted) by item id: the tier score
     * from {@code scored}, and wins and matches from the real match outcomes. Legacy runs without
     * matches fall back to list position for wins and matches too.
     */
    public static Map<Long, Delta> deltas(RunScoring.Scored scored, List<MatchOutcome> matches) {
        Map<Long, long[]> played = new TreeMap<>();
        if (matches != null) {
            for (MatchOutcome m : matches) {
                long[] winner = played.computeIfAbsent(m.winnerId(), k -> new long[2]);
                winner[0]++;
                winner[1]++;
                played.computeIfAbsent(m.loserId(), k -> new long[2])[1]++;
            }
        }
        int n = scored.size();
        Map<Long, Delta> result = new TreeMap<>();
        for (int i = 0; i < n; i++) {
            Long itemId = scored.ranking().get(i);
            double score = scored.standings().get(itemId).score();
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
     * Adds one counted run to the aggregates. Must run inside the transaction that saves the
     * result. Rows are upserted in item-id order so concurrent submissions to the same bracket
     * lock rows in the same order and cannot deadlock.
     */
    public void applyRun(long bracketId, Map<Long, Delta> deltas) {
        lock("pg_advisory_xact_lock_shared", bracketId);
        List<Object[]> rows = new ArrayList<>();
        deltas.forEach((itemId, d) -> rows.add(new Object[]{itemId, bracketId, d.score(), d.wins(), d.matches()}));
        jdbc.batchUpdate(UPSERT, rows);
    }

    /**
     * Takes the bracket's exclusive stats lock until the transaction ends. A rebuild takes it
     * before reading the results, so every run is either in what it reads or added after it.
     */
    public void lockExclusively(long bracketId) {
        lock("pg_advisory_xact_lock", bracketId);
    }

    /** Replaces a bracket's rows with {@code totals}; call {@link #lockExclusively} first. */
    public void replaceAll(long bracketId, Map<Long, Totals> totals) {
        jdbc.update("DELETE FROM item_stats WHERE bracket_id = ?", bracketId);
        List<Object[]> rows = new ArrayList<>();
        totals.forEach((itemId, t) -> rows.add(new Object[]{itemId, bracketId, t.timesRanked(), t.scoreSum(), t.wins(), t.matches()}));
        jdbc.batchUpdate("""
                INSERT INTO item_stats (item_id, bracket_id, times_ranked, score_sum, wins, matches)
                VALUES (?, ?, ?, ?, ?, ?)
                """, rows);
    }

    private void lock(String function, long bracketId) {
        jdbc.query("SELECT " + function + "(?)", rs -> null, bracketId);
    }

    /** The raw rows of a bracket, keyed by item id (for tests and comparisons). */
    public Map<Long, Totals> findTotals(long bracketId) {
        Map<Long, Totals> totals = new TreeMap<>();
        jdbc.query("SELECT item_id, times_ranked, score_sum, wins, matches FROM item_stats WHERE bracket_id = ?",
                rs -> {
                    totals.put(rs.getLong("item_id"), new Totals(rs.getLong("times_ranked"), rs.getDouble("score_sum"),
                            rs.getLong("wins"), rs.getLong("matches")));
                }, bracketId);
        return totals;
    }

    public List<ItemRankingDto> findRankings(Long bracketId) {
        List<ItemRankingDto> rankings = jdbc.query("""
                SELECT i.id, i.bracket_id, i.title, i.media_url, i.media_type,
                       s.times_ranked, s.score_sum, s.wins, s.matches
                FROM item_stats s JOIN items i ON i.id = s.item_id
                WHERE s.bracket_id = ? AND s.times_ranked > 0
                """, (rs, rowNum) -> {
            ItemDto item = new ItemDto(rs.getLong("id"), rs.getLong("bracket_id"), rs.getString("title"),
                    rs.getString("media_url"), rs.getString("media_type"));
            int timesRanked = rs.getInt("times_ranked");
            double scoreSum = rs.getDouble("score_sum");
            long wins = rs.getLong("wins");
            long matches = rs.getLong("matches");
            return new ItemRankingDto(item, wins, matches, Leaderboard.winPercentage(wins, matches),
                    Leaderboard.adjustedScore(scoreSum, timesRanked), scoreSum / timesRanked, timesRanked);
        }, bracketId);
        rankings.sort(Leaderboard.ORDER);
        return rankings;
    }
}
