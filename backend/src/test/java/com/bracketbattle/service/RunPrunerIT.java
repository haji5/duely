package com.bracketbattle.service;

import com.bracketbattle.support.IntegrationTest;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * The sweep deletes guests' uncounted runs once their ticket has expired, and nothing else: not
 * counted runs, not recent ones, not a signed-in player's history.
 */
class RunPrunerIT extends IntegrationTest {

    @Autowired
    RunPruner pruner;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MeterRegistry meters;

    @Test
    void onlyExpiredUncountedGuestRunsAreDeleted() throws Exception {
        long id = createBracket(USER_A, "Pruned", 4).get("id").asLong();
        List<Long> items = itemIds(id);

        long countedGuest = save(null, id, runPayload(items, null, null)); // ticket dated an hour back
        long freshGuest = save(null, id, quickRun(null, id));
        long oldGuest = save(null, id, quickRun(null, id));
        long oldSignedIn = save(USER_B, id, quickRun(USER_B, id));
        for (long run : List.of(countedGuest, oldGuest, oldSignedIn)) {
            jdbc.update("UPDATE results SET created_at = now() - interval '14 hours' WHERE id = ?", run);
        }
        assertThat(counted(countedGuest)).isTrue();
        assertThat(counted(freshGuest)).isFalse();
        assertThat(counted(oldGuest)).isFalse();
        assertThat(counted(oldSignedIn)).isFalse();

        long runCount = runCount(id);
        String rankings = perform(get("/brackets/" + id + "/rankings")).getResponse().getContentAsString();
        double prunedBefore = pruned();

        assertThat(pruner.prune()).isGreaterThanOrEqualTo(1);

        assertThat(jdbc.queryForList("SELECT id FROM results WHERE bracket_id = ? ORDER BY id", Long.class, id))
                .containsExactly(countedGuest, freshGuest, oldSignedIn);
        assertThat(runCount(id)).isEqualTo(runCount).isEqualTo(1);
        redis.delete(redis.keys("*bracketRankings*")); // read the leaderboard from the table again
        assertThat(perform(get("/brackets/" + id + "/rankings")).getResponse().getContentAsString()).isEqualTo(rankings);
        assertThat(body(perform(as(USER_B, get("/me/results").param("bracketId", Long.toString(id)))))).hasSize(1);
        assertThat(pruned()).isGreaterThanOrEqualTo(prunedBefore + 1);

        // A second sweep finds nothing more of this bracket's.
        pruner.prune();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isEqualTo(3);
    }

    /** A run submitted straight after its ticket was issued: too fast to count. */
    private Map<String, Object> quickRun(String token, long bracketId) throws Exception {
        JsonNode ticket = startRun(token, bracketId, 4);
        List<Long> entrants = new ArrayList<>();
        ticket.get("entrantIds").forEach(e -> entrants.add(e.asLong()));
        return Map.of("ticket", ticket.get("ticket").asString(), "matches", knockoutMatches(entrants));
    }

    private long save(String token, long bracketId, Map<String, Object> payload) throws Exception {
        MvcResult result = perform(as(token, postJson("/brackets/" + bracketId + "/results", payload)));
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200);
        return body(result).get("id").asLong();
    }

    private boolean counted(long runId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT counted FROM results WHERE id = ?", Boolean.class, runId));
    }

    private long runCount(long bracketId) throws Exception {
        return body(perform(get("/brackets/" + bracketId + "/stats"))).get("runCount").asLong();
    }

    private double pruned() {
        var counter = meters.find("duely.runs.pruned").counter();
        return counter == null ? 0 : counter.count();
    }
}
