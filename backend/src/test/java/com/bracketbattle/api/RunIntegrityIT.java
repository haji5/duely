package com.bracketbattle.api;

import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.service.StatsService;
import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Server-authoritative runs: the server picks the entrants, signs them into a ticket, derives the
 * ranking from the matches, and bounds what one player can add to a leaderboard. The daily quotas
 * are lowered to 2 counted runs per bracket here so they are cheap to reach.
 */
@TestPropertySource(properties = {
        "app.rate-limit.buckets.counted-user.limit=2",
        "app.rate-limit.buckets.counted-ip.limit=2"
})
class RunIntegrityIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ItemStatsRepository itemStats;

    @Autowired
    StatsService statsService;

    // ---- starting a run ------------------------------------------------------------------------

    @Test
    void startingARunPicksEntrantsFromTheBracketAtAnAllowedSize() throws Exception {
        long id = createBracket(USER_A, "Five", 5).get("id").asLong();
        Set<Long> items = new HashSet<>(itemIds(id));

        JsonNode withByes = startRun(null, id, 8); // guests may start runs
        assertThat(withByes.get("size").asInt()).isEqualTo(8);
        assertThat(ids(withByes)).hasSize(5).doesNotHaveDuplicates().allMatch(items::contains);
        assertThat(withByes.get("ticket").asString()).contains(".");

        JsonNode subset = startRun(USER_A, id, 4);
        assertThat(ids(subset)).hasSize(4).doesNotHaveDuplicates().allMatch(items::contains);

        for (int size : List.of(1, 3, 5, 16)) {
            MvcResult bad = perform(postJson("/brackets/" + id + "/runs", Map.of("size", size)));
            assertThat(bad.getResponse().getStatus()).as("size " + size).isEqualTo(400);
            assertThat(body(bad).get("errors").has("size")).isTrue();
        }
        assertThat(perform(postJson("/brackets/" + id + "/runs", Map.of())).getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(postJson("/brackets/987654321/runs", Map.of("size", 2))).getResponse().getStatus()).isEqualTo(404);

        // Seeding is shuffled on the server.
        Set<List<Long>> orders = new HashSet<>();
        for (int i = 0; i < 6; i++) orders.add(ids(startRun(null, id, 8)));
        assertThat(orders).hasSizeGreaterThan(1);
    }

    // ---- (a) to (c): only runs the server started ---------------------------------------------

    @Test
    void aSubmissionWithoutAValidTicketIsRejected() throws Exception {
        long id = createBracket(USER_A, "Ticketless", 4).get("id").asLong();
        List<Long> r = itemIds(id);
        String ticket = ticketFor(r);
        String forged = ticket.substring(0, ticket.length() - 2) + (ticket.endsWith("A") ? "BB" : "AA");

        for (Object bad : List.of("", "garbage", "abc.def", forged)) {
            MvcResult result = perform(postJson("/brackets/" + id + "/results", Map.of("ticket", bad, "matches", knockoutMatches(r))));
            assertThat(result.getResponse().getStatus()).as("ticket " + bad).isEqualTo(400);
        }
        assertThat(perform(postJson("/brackets/" + id + "/results", Map.of("matches", knockoutMatches(r))))
                .getResponse().getStatus()).isEqualTo(400);
        assertNothingSaved(id);
    }

    @Test
    void aTicketForOneBracketCannotBeUsedOnAnother() throws Exception {
        long a = createBracket(USER_A, "Bracket A", 2).get("id").asLong();
        long b = createBracket(USER_A, "Bracket B", 2).get("id").asLong();
        String ticketForA = ticketFor(itemIds(a));
        MvcResult result = perform(postJson("/brackets/" + b + "/results", Map.of("ticket", ticketForA, "matches", knockoutMatches(itemIds(b)))));
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(result).get("message").asString()).contains("different bracket");
        assertNothingSaved(b);
    }

    @Test
    void matchesNamingAnEntryOutsideTheTicketAreRejected() throws Exception {
        long id = createBracket(USER_A, "Outsider", 8).get("id").asLong();
        List<Long> items = itemIds(id);
        List<Long> entrants = items.subList(0, 4);
        String ticket = ticketFor(entrants);
        List<Long> swapped = new ArrayList<>(entrants);
        swapped.set(3, items.get(7)); // same bracket, but the server didn't pick it

        MvcResult result = perform(postJson("/brackets/" + id + "/results", Map.of("ticket", ticket, "matches", knockoutMatches(swapped))));
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(result).get("message").asString()).contains("entries this run was started with");
        // Dropping an entrant is just as wrong.
        MvcResult partial = perform(postJson("/brackets/" + id + "/results",
                Map.of("ticket", ticket, "matches", knockoutMatches(entrants.subList(0, 2)))));
        assertThat(partial.getResponse().getStatus()).isEqualTo(400);
        assertNothingSaved(id);
    }

    // ---- (d): saved but not counted ------------------------------------------------------------

    @Test
    void aRunFasterThanTheUiAllowsIsSavedButNotCounted() throws Exception {
        long id = createBracket(USER_A, "Speedrun", 8).get("id").asLong();
        JsonNode run = startRun(USER_A, id, 8);
        Map<String, Object> payload = Map.of("ticket", run.get("ticket").asString(), "matches", knockoutMatches(ids(run)),
                "comment", "too quick", "displayName", "Speedy");

        MvcResult result = perform(as(USER_A, postJson("/brackets/" + id + "/results", payload)));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(result).has("counted")).isFalse();

        assertThat(itemStats.findTotals(id)).isEmpty();
        assertThat(runCount(id)).isZero();
        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();
        // Still the player's own run.
        assertThat(body(perform(as(USER_A, get("/me/results").param("bracketId", Long.toString(id)))))).hasSize(1);
    }

    @Test
    void runsPastTheDailyQuotaAreSavedButNotCounted() throws Exception {
        long id = createBracket(USER_A, "Quota", 4).get("id").asLong();
        long other = createBracket(USER_A, "Quota elsewhere", 4).get("id").asLong();
        List<Long> r = itemIds(id);

        for (int i = 0; i < 3; i++) {
            assertThat(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(r, null, null))))
                    .getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(itemStats.findTotals(id).values()).hasSize(4).allMatch(t -> t.timesRanked() == 2);
        assertThat(runCount(id)).isEqualTo(2);
        assertThat(body(perform(as(USER_A, get("/me/results").param("bracketId", Long.toString(id)))))).hasSize(3);

        // The quota is per bracket and per player: another bracket, and guests, start fresh.
        perform(as(USER_A, postJson("/brackets/" + other + "/results", runPayload(itemIds(other), null, null))));
        assertThat(runCount(other)).isEqualTo(1);
        for (int i = 0; i < 3; i++) {
            assertThat(perform(postJson("/brackets/" + id + "/results", runPayload(r, null, null)))
                    .getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(runCount(id)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isEqualTo(6);
    }

    // ---- (e): tiers ----------------------------------------------------------------------------

    @Test
    void firstRoundLosersOfAnEightEntryRunReceiveIdenticalScores() throws Exception {
        long id = createBracket(USER_A, "Tiers", 8).get("id").asLong();
        List<Long> r = itemIds(id);
        JsonNode saved = body(perform(postJson("/brackets/" + id + "/results", runPayload(r, null, null))));

        assertThat(saved.get("ranking").get(0).asLong()).isEqualTo(r.get(0));
        JsonNode places = saved.get("places");
        for (int i = 4; i < 8; i++) {
            assertThat(places.get(i).get("from").asInt()).isEqualTo(5);
            assertThat(places.get(i).get("to").asInt()).isEqualTo(8);
        }
        assertThat(places.get(2).get("from").asInt()).isEqualTo(3);
        assertThat(places.get(2).get("to").asInt()).isEqualTo(4);

        Map<Long, ItemStatsRepository.Totals> totals = itemStats.findTotals(id);
        Set<Double> firstRound = new HashSet<>();
        for (int i = 4; i < 8; i++) firstRound.add(totals.get(r.get(i)).scoreSum());
        assertThat(firstRound).containsExactly((7 - 5.5) / 7);
        assertThat(totals.get(r.get(0)).scoreSum()).isEqualTo(1.0);
        assertThat(totals.get(r.get(1)).scoreSum()).isEqualTo(6.0 / 7);
    }

    // ---- (f): rebuild --------------------------------------------------------------------------

    @Test
    void aRebuildReproducesExactlyWhatTheIncrementalUpdatesProduced() throws Exception {
        long id = createBracket(USER_A, "Rebuilt", 8).get("id").asLong();
        List<Long> r = itemIds(id);
        List<List<Long>> runs = List.of(
                r,
                List.of(r.get(3), r.get(1), r.get(0), r.get(7), r.get(5)),   // five entrants, three byes
                List.of(r.get(6), r.get(2)),
                List.of(r.get(2), r.get(6), r.get(4)),
                List.of(r.get(7), r.get(6), r.get(5), r.get(4), r.get(3), r.get(2), r.get(1), r.get(0)));
        String[] users = {USER_A, USER_B, USER_C, null, ADMIN};
        for (int i = 0; i < runs.size(); i++) {
            assertThat(perform(as(users[i], postJson("/brackets/" + id + "/results", runPayload(runs.get(i), null, null))))
                    .getResponse().getStatus()).isEqualTo(200);
        }
        // An uncounted run must stay out of the rebuild too.
        JsonNode quick = startRun(null, id, 4);
        perform(postJson("/brackets/" + id + "/results", Map.of("ticket", quick.get("ticket").asString(), "matches", knockoutMatches(ids(quick)))));

        Map<Long, ItemStatsRepository.Totals> incremental = itemStats.findTotals(id);
        assertThat(incremental).hasSize(8);
        perform(get("/brackets/" + id + "/rankings")); // cache the leaderboard

        jdbc.update("UPDATE item_stats SET score_sum = 0 WHERE bracket_id = ?", id);
        assertThat(perform(as(USER_A, post("/admin/brackets/" + id + "/stats/rebuild"))).getResponse().getStatus()).isEqualTo(403);
        assertThat(perform(post("/admin/brackets/" + id + "/stats/rebuild")).getResponse().getStatus()).isEqualTo(401);
        assertThat(perform(as(ADMIN, post("/admin/brackets/987654321/stats/rebuild"))).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(as(ADMIN, post("/admin/brackets/" + id + "/stats/rebuild"))).getResponse().getStatus()).isEqualTo(204);

        assertThat(itemStats.findTotals(id)).isEqualTo(incremental);
        // The cached leaderboard was dropped with the rebuild.
        JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
        assertThat(rankings.get(0).get("averageScore").asDouble()).isPositive();
    }

    @Test
    void aNewScoringVersionRebuildsEveryBracketOnStartup() throws Exception {
        long id = createBracket(USER_A, "Upgraded", 4).get("id").asLong();
        perform(postJson("/brackets/" + id + "/results", runPayload(itemIds(id), null, null)));
        Map<Long, ItemStatsRepository.Totals> before = itemStats.findTotals(id);

        jdbc.update("UPDATE item_stats SET score_sum = 0, times_ranked = 9 WHERE bracket_id = ?", id);
        jdbc.update("UPDATE app_meta SET meta_value = '1' WHERE meta_key = 'stats_version'");
        statsService.run(null);

        assertThat(itemStats.findTotals(id)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT meta_value FROM app_meta WHERE meta_key = 'stats_version'", String.class))
                .isEqualTo("2");
    }

    // ---- (g): idempotency ----------------------------------------------------------------------

    @Test
    void aRetryWithTheSameTicketReturnsTheOriginalResult() throws Exception {
        long id = createBracket(USER_A, "Retried", 4).get("id").asLong();
        Map<String, Object> payload = runPayload(itemIds(id), "once", "first try");
        JsonNode first = body(perform(as(USER_B, postJson("/brackets/" + id + "/results", payload))));
        JsonNode again = body(perform(as(USER_B, postJson("/brackets/" + id + "/results", payload))));

        assertThat(again.get("id").asLong()).isEqualTo(first.get("id").asLong());
        assertThat(again.get("comment").asString()).isEqualTo("first try");
        assertThat(itemStats.findTotals(id).values()).hasSize(4).allMatch(t -> t.timesRanked() == 1);
        assertThat(runCount(id)).isEqualTo(1);
    }

    // ---- helpers -------------------------------------------------------------------------------

    private static List<Long> ids(JsonNode run) {
        List<Long> ids = new ArrayList<>();
        run.get("entrantIds").forEach(n -> ids.add(n.asLong()));
        return ids;
    }

    private long runCount(long bracketId) throws Exception {
        return body(perform(get("/brackets/" + bracketId + "/stats"))).get("runCount").asLong();
    }

    private void assertNothingSaved(long bracketId) {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, bracketId)).isZero();
        assertThat(itemStats.findTotals(bracketId)).isEmpty();
    }
}
