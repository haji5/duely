package com.bracketbattle.repository;

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

/** The Liquibase backfill must produce exactly what applyRun produces for legacy (match-less) runs. */
class BackfillMigrationIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ItemStatsRepository itemStats;

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

        jdbc.update("DELETE FROM item_stats WHERE bracket_id = ?", bracketId);
        runs.forEach(run -> itemStats.applyRun(bracketId, run, null));
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

    private List<Map<String, Object>> snapshot(long bracketId) {
        return jdbc.queryForList("""
                SELECT item_id, times_ranked, score_sum, wins, matches
                FROM item_stats WHERE bracket_id = ? ORDER BY item_id
                """, bracketId);
    }
}
