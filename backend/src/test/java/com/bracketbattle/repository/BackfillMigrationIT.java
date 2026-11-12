package com.bracketbattle.repository;

import com.bracketbattle.service.StatsService;
import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** The Liquibase backfill must produce exactly what a rebuild produces for legacy (match-less) runs. */
class BackfillMigrationIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    StatsService statsService;

    @Test
    void backfillEqualsIncrementalAggregatesForLegacyRuns() throws Exception {
        long bracketId = createBracket(USER_A, "Legacy runs", 5).get("id").asLong();
        List<Long> ids = itemIds(bracketId);
        List<List<Long>> runs = List.of(
                List.of(ids.get(0), ids.get(1), ids.get(2), ids.get(3)),
                List.of(ids.get(4), ids.get(2), ids.get(1), ids.get(0), ids.get(3)),
                List.of(ids.get(3), ids.get(0)),
                List.of(ids.get(1), ids.get(4)));
        for (List<Long> run : runs) {
            jdbc.update("INSERT INTO results (bracket_id, ranking, submission_token) VALUES (?, ?, gen_random_uuid()::text)",
                    bracketId, json.writeValueAsString(run));
        }

        statsService.rebuild(bracketId);
        List<Map<String, Object>> incremental = snapshot(bracketId);

        jdbc.update("TRUNCATE item_stats");
        String sql = new ClassPathResource("db/changelog/sql/backfill-item-stats.sql").getContentAsString(StandardCharsets.UTF_8);
        jdbc.execute(sql);
        List<Map<String, Object>> backfilled = snapshot(bracketId);

        assertThat(backfilled).hasSize(5).hasSameSizeAs(incremental);
        for (int i = 0; i < incremental.size(); i++) {
            Map<String, Object> a = incremental.get(i);
            Map<String, Object> b = backfilled.get(i);
            assertThat(b.get("item_id")).isEqualTo(a.get("item_id"));
            assertThat(b.get("times_ranked")).isEqualTo(a.get("times_ranked"));
            assertThat(b.get("wins")).isEqualTo(a.get("wins"));
            assertThat(b.get("matches")).isEqualTo(a.get("matches"));
            assertThat((Double) b.get("score_sum")).isCloseTo((Double) a.get("score_sum"), within(1e-9));
        }
    }

    @Test
    void counterBackfillEqualsTheCountersTheApplicationKeeps() throws Exception {
        long played = createBracket(USER_A, "Counted runs", 3).get("id").asLong();
        long unplayed = createBracket(USER_A, "No runs", 2).get("id").asLong();
        for (int i = 0; i < 3; i++) {
            perform(postJson("/brackets/" + played + "/results", runPayload(itemIds(played), null, null)));
        }
        // An uncounted run counts for neither.
        jdbc.update("""
                INSERT INTO results (bracket_id, ranking, submission_token, counted, created_at)
                VALUES (?, ?, gen_random_uuid()::text, false, now() + interval '1 hour')
                """, played, json.writeValueAsString(itemIds(played)));
        List<Map<String, Object>> live = counters(played, unplayed);

        jdbc.update("UPDATE brackets SET item_count = 0, run_count = 0, last_run_at = NULL WHERE id IN (?, ?)", played, unplayed);
        // Scoped to these two: other tests write rows straight to the table with counters but no
        // entries, and the database is shared.
        String backfill = new ClassPathResource("db/changelog/sql/backfill-bracket-counters.sql")
                .getContentAsString(StandardCharsets.UTF_8).strip();
        assertThat(backfill).endsWith(";");
        jdbc.update(backfill.substring(0, backfill.length() - 1) + " WHERE b.id IN (?, ?)", played, unplayed);

        assertThat(counters(played, unplayed)).isEqualTo(live);
        assertThat(live.get(0)).containsEntry("item_count", 3).containsEntry("run_count", 3L);
        assertThat(live.get(1)).containsEntry("item_count", 2).containsEntry("run_count", 0L).containsEntry("last_run_at", null);
    }

    private List<Map<String, Object>> counters(long... ids) {
        return java.util.Arrays.stream(ids)
                .mapToObj(id -> jdbc.queryForMap("SELECT item_count, run_count, last_run_at FROM brackets WHERE id = ?", id))
                .toList();
    }

    private List<Map<String, Object>> snapshot(long bracketId) {
        return jdbc.queryForList("""
                SELECT item_id, times_ranked, score_sum, wins, matches
                FROM item_stats WHERE bracket_id = ? ORDER BY item_id
                """, bracketId);
    }
}
