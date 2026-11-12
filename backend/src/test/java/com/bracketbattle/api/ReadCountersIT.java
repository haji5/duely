package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The counters on the bracket row are kept in step with what they count, and a run evicts only
 * the cache entries it made stale.
 */
class ReadCountersIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void countedRunsMoveTheCountersAndUncountedOnesDont() throws Exception {
        long id = createBracket(USER_A, "Counters", 8).get("id").asLong();
        assertThat(counters(id)).containsEntry("item_count", 8).containsEntry("run_count", 0L).containsEntry("last_run_at", null);

        perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(itemIds(id), null, null))));
        perform(postJson("/brackets/" + id + "/results", runPayload(itemIds(id), null, null)));
        Map<String, Object> afterTwo = counters(id);
        assertThat(afterTwo.get("run_count")).isEqualTo(2L);
        Timestamp latest = jdbc.queryForObject("SELECT MAX(created_at) FROM results WHERE bracket_id = ?", Timestamp.class, id);
        assertThat(afterTwo.get("last_run_at")).isEqualTo(latest);

        // Played faster than the UI allows: saved, not counted, so no counter moves.
        JsonNode run = startRun(USER_A, id, 8);
        Map<String, Object> quick = Map.of("ticket", run.get("ticket").asString(), "matches", knockoutMatches(entrants(run)));
        assertThat(perform(as(USER_A, postJson("/brackets/" + id + "/results", quick))).getResponse().getStatus()).isEqualTo(200);
        assertThat(counters(id)).isEqualTo(afterTwo);

        assertThat(body(perform(get("/brackets/" + id + "/stats"))).get("runCount").asLong()).isEqualTo(2);
        assertThat(body(perform(get("/brackets/" + id))).get("runCount").asLong()).isEqualTo(2);
        assertThat(body(perform(get("/brackets").param("q", "Counters"))).get("items").get(0).get("runCount").asLong()).isEqualTo(2);
    }

    @Test
    void removingRunsRecountsThem() throws Exception {
        long id = createBracket(USER_A, "Recount", 2).get("id").asLong();
        long first = submit(USER_B, id, "first");
        long second = submit(USER_B, id, null);

        assertThat(perform(as(ADMIN, delete("/admin/results/" + second))).getResponse().getStatus()).isEqualTo(204);
        Timestamp firstAt = jdbc.queryForObject("SELECT created_at FROM results WHERE id = ?", Timestamp.class, first);
        assertThat(counters(id)).containsEntry("run_count", 1L).containsEntry("last_run_at", firstAt);
        assertThat(body(perform(get("/brackets/" + id + "/stats"))).get("runCount").asLong()).isEqualTo(1);

        assertThat(perform(as(ADMIN, delete("/admin/results/" + first))).getResponse().getStatus()).isEqualTo(204);
        assertThat(counters(id)).containsEntry("run_count", 0L).containsEntry("last_run_at", null);

        // A rebuild from scratch puts back what the runs say, whatever the counters held.
        submit(USER_B, id, null);
        Map<String, Object> live = counters(id);
        jdbc.update("UPDATE brackets SET run_count = 99, last_run_at = NULL WHERE id = ?", id);
        assertThat(perform(as(ADMIN, post("/admin/brackets/" + id + "/stats/rebuild"))).getResponse().getStatus()).isEqualTo(204);
        assertThat(counters(id)).isEqualTo(live);
    }

    @Test
    void aRunEvictsOnlyWhatItChanged() throws Exception {
        // Eight entries: the quick run below must stay under 7 x 0.4 s to be uncounted.
        long id = createBracket(USER_A, "Evictions", 8).get("id").asLong();
        submit(USER_B, id, "seed comment");
        warm(id);

        // No comment: the comments stay cached; the leaderboard and run count do not.
        submit(USER_B, id, null);
        assertThat(redis.hasKey(key("bracketComments", id))).isTrue();
        assertThat(redis.hasKey(key("bracketRankings", id))).isFalse();
        assertThat(redis.hasKey(key("bracket", id))).isFalse();
        assertThat(redis.hasKey(key("bracketItems", id))).isTrue();
        assertThat(redis.hasKey(key("userResults", "uid-b:" + id))).isFalse();

        // A comment: now the comments go, and show up at once.
        warm(id);
        submit(USER_B, id, "fresh comment");
        assertThat(redis.hasKey(key("bracketComments", id))).isFalse();
        assertThat(body(perform(get("/brackets/" + id + "/comments"))).get(0).get("comment").asString()).isEqualTo("fresh comment");

        // An uncounted run with a comment changes nothing public, so nothing public is evicted.
        warm(id);
        JsonNode run = startRun(USER_B, id, 8);
        Map<String, Object> quick = Map.of("ticket", run.get("ticket").asString(), "matches", knockoutMatches(entrants(run)),
                "comment", "too quick");
        assertThat(perform(as(USER_B, postJson("/brackets/" + id + "/results", quick))).getResponse().getStatus()).isEqualTo(200);
        for (String cache : List.of("bracket", "bracketRankings", "bracketComments")) {
            assertThat(redis.hasKey(key(cache, id))).as(cache).isTrue();
        }
        assertThat(redis.hasKey(key("userResults", "uid-b:" + id))).isFalse();
    }

    @Test
    void myResultsAreTheLatestHundredOldestFirst() throws Exception {
        long id = createBracket(USER_C, "Many runs", 2).get("id").asLong();
        List<Long> items = itemIds(id);
        String ranking = json.writeValueAsString(items);
        String matches = json.writeValueAsString(knockoutMatches(items));
        Instant start = Instant.now().minus(Duration.ofDays(2));
        List<Long> inserted = new ArrayList<>();
        for (int i = 0; i < 105; i++) {
            inserted.add(jdbc.queryForObject("""
                    INSERT INTO results (bracket_id, user_id, ranking, matches, submission_token, created_at, counted)
                    VALUES (?, 'uid-c', ?, ?, gen_random_uuid()::text, ?, false) RETURNING id
                    """, Long.class, id, ranking, matches, Timestamp.from(start.plus(Duration.ofMinutes(i)))));
        }

        JsonNode mine = body(perform(as(USER_C, get("/me/results").param("bracketId", Long.toString(id)))));
        List<Long> returned = new ArrayList<>();
        mine.forEach(r -> returned.add(r.get("id").asLong()));
        assertThat(returned).containsExactlyElementsOf(inserted.subList(5, 105));
    }

    @Test
    void blankCommentsAreNotComments() throws Exception {
        long id = createBracket(USER_A, "Blank comments", 2).get("id").asLong();
        submit(USER_B, id, "   ");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ? AND comment IS NOT NULL", Long.class, id)).isZero();
        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();
    }

    // ---- helpers -----------------------------------------------------------------------------

    private Map<String, Object> counters(long id) {
        return jdbc.queryForMap("SELECT item_count, run_count, last_run_at FROM brackets WHERE id = ?", id);
    }

    private long submit(String token, long bracketId, String comment) throws Exception {
        MvcResult result = perform(as(token, postJson("/brackets/" + bracketId + "/results", runPayload(itemIds(bracketId), null, comment))));
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200);
        return body(result).get("id").asLong();
    }

    private void warm(long id) throws Exception {
        for (String path : List.of("", "/items", "/rankings", "/comments")) {
            perform(get("/brackets/" + id + path));
        }
        perform(as(USER_B, get("/me/results").param("bracketId", Long.toString(id))));
        for (String cache : List.of("bracket", "bracketItems", "bracketRankings", "bracketComments")) {
            assertThat(redis.hasKey(key(cache, id))).as(cache).isTrue();
        }
        assertThat(redis.hasKey(key("userResults", "uid-b:" + id))).isTrue();
    }

    private static List<Long> entrants(JsonNode run) {
        List<Long> ids = new ArrayList<>();
        run.get("entrantIds").forEach(n -> ids.add(n.asLong()));
        return ids;
    }

    private static String key(String cache, Object key) {
        return "duely:v8:" + cache + "::" + key;
    }
}
