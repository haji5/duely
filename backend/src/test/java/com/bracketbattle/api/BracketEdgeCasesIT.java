package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import tools.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Edge cases around the main API flows: races, odd input and boundaries. */
class BracketEdgeCasesIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    // ---- concurrency ---------------------------------------------------------------------------

    @Test
    void concurrentRetriesWithOneTokenSaveOneRunAndCountItOnce() throws Exception {
        long id = createBracket(USER_A, "Race", 4).get("id").asLong();
        Map<String, Object> payload = runPayload(itemIds(id), "race-token", null);

        List<MvcResult> results = concurrently(8, () -> perform(as(USER_A, postJson("/brackets/" + id + "/results", payload))));

        Set<Long> ids = new HashSet<>();
        for (MvcResult r : results) {
            assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
            ids.add(body(r).get("id").asLong());
        }
        assertThat(ids).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT times_ranked FROM item_stats WHERE bracket_id = ?", Integer.class, id))
                .hasSize(4).containsOnly(1);
    }

    @Test
    void concurrentRunsOnOneBracketAreAllCounted() throws Exception {
        long id = createBracket(USER_A, "Busy", 8).get("id").asLong();
        List<Long> ranking = itemIds(id);

        List<MvcResult> results = concurrently(10, () -> perform(postJson("/brackets/" + id + "/results", runPayload(ranking, null, null))));

        results.forEach(r -> assertThat(r.getResponse().getStatus()).isEqualTo(200));
        assertThat(jdbc.queryForList("SELECT times_ranked FROM item_stats WHERE bracket_id = ?", Integer.class, id))
                .hasSize(8).containsOnly(10);
        JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
        assertThat(rankings.get(0).get("item").get("id").asLong()).isEqualTo(ranking.get(0));
        assertThat(rankings.get(0).get("wins").asLong()).isEqualTo(30); // 3 wins per 8-entry run
    }

    private static List<MvcResult> concurrently(int n, Callable<MvcResult> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            List<Callable<MvcResult>> tasks = new ArrayList<>();
            for (int i = 0; i < n; i++) tasks.add(task);
            List<MvcResult> out = new ArrayList<>();
            for (Future<MvcResult> f : pool.invokeAll(tasks)) out.add(f.get());
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    // ---- submission tokens ---------------------------------------------------------------------

    @Test
    void aTokenCannotBeReusedForAnotherBracketOrSubmitter() throws Exception {
        long id = createBracket(USER_A, "Token A", 2).get("id").asLong();
        long other = createBracket(USER_A, "Token B", 2).get("id").asLong();
        assertThat(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(itemIds(id), "shared-1", null))))
                .getResponse().getStatus()).isEqualTo(200);

        // Same user, other bracket
        assertThat(perform(as(USER_A, postJson("/brackets/" + other + "/results", runPayload(itemIds(other), "shared-1", null))))
                .getResponse().getStatus()).isEqualTo(409);

        // A guest's token cannot be claimed by a signed-in user
        perform(postJson("/brackets/" + id + "/results", runPayload(itemIds(id), "guest-shared", null)));
        assertThat(perform(as(USER_B, postJson("/brackets/" + id + "/results", runPayload(itemIds(id), "guest-shared", null))))
                .getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void aRetryWithADifferentPayloadReturnsTheOriginalAndCountsNothingNew() throws Exception {
        long id = createBracket(USER_A, "Retry", 2).get("id").asLong();
        List<Long> items = itemIds(id);
        JsonNode first = body(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(items, "retry-1", "first")))));
        JsonNode retry = body(perform(as(USER_A, postJson("/brackets/" + id + "/results",
                runPayload(List.of(items.get(1), items.get(0)), "retry-1", "second")))));

        assertThat(retry.get("id").asLong()).isEqualTo(first.get("id").asLong());
        assertThat(retry.get("comment").asString()).isEqualTo("first");
        assertThat(jdbc.queryForObject("SELECT SUM(times_ranked) FROM item_stats WHERE bracket_id = ?", Long.class, id))
                .isEqualTo(2);
    }

    // ---- run payloads --------------------------------------------------------------------------

    @Test
    void malformedRunPayloadsAreFieldErrors() throws Exception {
        long id = createBracket(USER_A, "Shapes", 2).get("id").asLong();
        List<Long> r = itemIds(id);

        Map<String, Object> nullWinner = new HashMap<>();
        nullWinner.put("winnerId", null);
        nullWinner.put("loserId", r.get(1));
        assertBadRun(id, Map.of("ranking", r, "matches", List.of(nullWinner), "submissionToken", "n1"));
        assertBadRun(id, Map.of("ranking", List.of(0L, -1L), "matches", List.of(), "submissionToken", "n2"));
        assertBadRun(id, Map.of("ranking", r, "matches", knockoutMatches(r), "submissionToken", "   "));
        assertBadRun(id, Map.of("ranking", r, "matches", knockoutMatches(r), "submissionToken", "x".repeat(101)));
        assertBadRun(id, Map.of("ranking", r, "matches", knockoutMatches(r), "submissionToken", "c1",
                "comment", "x".repeat(501)));
        assertBadRun(id, Map.of("ranking", "not a list", "matches", List.of(), "submissionToken", "n3"));
        assertBadRun(id, Map.of("ranking", List.of(r.get(0), "abc"), "matches", List.of(), "submissionToken", "n4"));

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isZero();
    }

    @Test
    void aStarRunCannotInflateTheChampionsWins() throws Exception {
        long id = createBracket(USER_A, "Star", 4).get("id").asLong();
        List<Long> r = itemIds(id);
        List<Map<String, Long>> star = List.of(
                Map.of("winnerId", r.get(0), "loserId", r.get(1)),
                Map.of("winnerId", r.get(0), "loserId", r.get(2)),
                Map.of("winnerId", r.get(0), "loserId", r.get(3)));
        assertBadRun(id, Map.of("ranking", r, "matches", star, "submissionToken", "star-1"));
    }

    @Test
    void aPartialRunOnlyTouchesTheItemsItRanked() throws Exception {
        long id = createBracket(USER_A, "Partial", 4).get("id").asLong();
        List<Long> r = itemIds(id);
        MvcResult result = perform(postJson("/brackets/" + id + "/results", runPayload(List.of(r.get(3), r.get(1)), null, null)));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);

        JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
        assertThat(rankings).hasSize(2);
        assertThat(rankings.get(0).get("item").get("id").asLong()).isEqualTo(r.get(3));
        assertThat(rankings.get(0).get("averageScore").asDouble()).isEqualTo(1.0);
    }

    @Test
    void markupOnlyCommentsAndNamesAreDropped() throws Exception {
        long id = createBracket(USER_A, "Quiet", 2).get("id").asLong();
        Map<String, Object> payload = runPayload(itemIds(id), null, null);
        payload.put("comment", "<b></b>   ");
        payload.put("displayName", "<i></i>");
        JsonNode saved = body(perform(postJson("/brackets/" + id + "/results", payload)));
        assertThat(saved.get("comment").isNull()).isTrue();
        assertThat(saved.get("displayName").isNull()).isTrue();
        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();

        Map<String, Object> named = runPayload(itemIds(id), null, "Nice <b>one</b> &amp; more");
        named.put("displayName", "  ");
        perform(postJson("/brackets/" + id + "/results", named));
        JsonNode comments = body(perform(get("/brackets/" + id + "/comments")));
        assertThat(comments).hasSize(1);
        assertThat(comments.get(0).get("comment").asString()).isEqualTo("Nice one & more");
        assertThat(comments.get(0).get("displayName").isNull()).isTrue();
    }

    private void assertBadRun(long bracketId, Map<String, Object> payload) throws Exception {
        MvcResult result = perform(postJson("/brackets/" + bracketId + "/results", payload));
        assertThat(result.getResponse().getStatus())
                .as("payload %s -> %s", payload, result.getResponse().getContentAsString())
                .isEqualTo(400);
        assertThat(body(result).get("message").asString()).isNotBlank();
    }

    // ---- bracket creation ----------------------------------------------------------------------

    @Test
    void creationBoundaries() throws Exception {
        assertThat(perform(as(USER_A, postJson("/brackets", bracketPayload("Max", "image", 500))))
                .getResponse().getStatus()).isEqualTo(200);
        MvcResult tooMany = perform(as(USER_A, postJson("/brackets", bracketPayload("Too many", "image", 501))));
        assertThat(tooMany.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(tooMany).get("errors").has("items")).isTrue();
        assertThat(perform(as(USER_A, postJson("/brackets", bracketPayload("One", "image", 1))))
                .getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void markupOnlyNamesAndTitlesAreRequiredErrors() throws Exception {
        Map<String, Object> payload = bracketPayload("<b></b>", "image", 2);
        MvcResult result = perform(as(USER_A, postJson("/brackets", payload)));
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(result).get("errors").has("name")).isTrue();

        Map<String, Object> badTitle = bracketPayload("Fine", "image", 2);
        badTitle.put("items", List.of(
                Map.of("title", "<script>x</script>", "mediaUrl", "https://images.example.com/1.png"),
                Map.of("title", "ok", "mediaUrl", "https://images.example.com/2.png")));
        MvcResult titled = perform(as(USER_A, postJson("/brackets", badTitle)));
        assertThat(titled.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(titled).get("errors").has("items[0].title")).isTrue();
    }

    @Test
    void creationRejectsBadTypesAndNullEntries() throws Exception {
        Map<String, Object> badType = bracketPayload("Typed", "image", 2);
        badType.put("type", "gif");
        MvcResult typed = perform(as(USER_A, postJson("/brackets", badType)));
        assertThat(typed.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(typed).get("errors").has("type")).isTrue();

        Map<String, Object> nullEntry = bracketPayload("Nulls", "image", 2);
        List<Object> items = new ArrayList<>((List<?>) nullEntry.get("items"));
        items.add(null);
        nullEntry.put("items", items);
        assertThat(perform(as(USER_A, postJson("/brackets", nullEntry))).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void mediaUrlsAreStoredTrimmedAndOctalHostsAreRejected() throws Exception {
        Map<String, Object> payload = bracketPayload("Trim", "image", 2);
        payload.put("items", List.of(
                Map.of("title", "a", "mediaUrl", "  https://images.example.com/1.png  "),
                Map.of("title", "b", "mediaUrl", "https://images.example.com/2.png")));
        long id = body(perform(as(USER_A, postJson("/brackets", payload)))).get("id").asLong();
        JsonNode items = body(perform(get("/brackets/" + id + "/items")));
        assertThat(items.get(0).get("mediaUrl").asString()).isEqualTo("https://images.example.com/1.png");

        Map<String, Object> octal = bracketPayload("Octal", "image", 2);
        octal.put("items", List.of(
                Map.of("title", "a", "mediaUrl", "https://012.0.0.1/x.png"),
                Map.of("title", "b", "mediaUrl", "https://images.example.com/2.png")));
        MvcResult rejected = perform(as(USER_A, postJson("/brackets", octal)));
        assertThat(rejected.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(rejected).get("errors").has("items[0].mediaUrl")).isTrue();
    }

    @Test
    void newBracketsAppearInCachedListsAtOnce() throws Exception {
        perform(get("/brackets"));
        perform(get("/brackets/popular"));
        long id = createBracket(USER_A, "Fresh in lists", 2).get("id").asLong();
        assertThat(body(perform(get("/brackets"))).get(0).get("id").asLong()).isEqualTo(id);
        assertThat(body(perform(get("/brackets/popular"))).toString()).contains("\"id\":" + id);
    }

    // ---- reads and errors ----------------------------------------------------------------------

    @Test
    void oddIdsAndParametersAreClientErrors() throws Exception {
        assertThat(perform(get("/brackets/0")).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(get("/brackets/-1")).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(get("/brackets/99999999999999999999")).getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(get("/brackets/1.5/items")).getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(as(USER_A, get("/me/results").param("bracketId", "abc"))).getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(as(USER_A, get("/me/results").param("bracketId", "987654321")))
                .getResponse().getContentAsString()).isEqualTo("[]");
        assertThat(perform(post("/brackets/1/results").contentType(MediaType.APPLICATION_JSON).content(""))
                .getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void aBracketWithoutRunsHasEmptyRankingsAndComments() throws Exception {
        long id = createBracket(USER_A, "Untouched", 3).get("id").asLong();
        assertThat(body(perform(get("/brackets/" + id + "/rankings")))).isEmpty();
        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();
    }

    @Test
    void publicBracketJsonHidesTheCreator() throws Exception {
        long id = createBracket(USER_A, "Private owner", 2).get("id").asLong();
        String single = perform(get("/brackets/" + id)).getResponse().getContentAsString();
        String list = perform(get("/brackets")).getResponse().getContentAsString();
        String mine = perform(as(USER_A, get("/me/brackets"))).getResponse().getContentAsString();
        for (String json : List.of(single, list, mine)) {
            assertThat(json).doesNotContain("uid-a").doesNotContain("createdBy");
        }
    }

    @Test
    void metadataInputIsValidatedBeforeAnyLookup() throws Exception {
        assertThat(perform(as(USER_A, get("/metadata/youtube/search").param("query", "   ")))
                .getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(as(USER_A, get("/metadata/youtube/search").param("query", "x".repeat(201))))
                .getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(as(USER_A, get("/metadata/youtube/search"))).getResponse().getStatus()).isEqualTo(400);
        MvcResult notPlaylist = perform(as(USER_A, get("/metadata/spotify/playlist").param("url", "https://open.spotify.com/track/abc")));
        assertThat(notPlaylist.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(notPlaylist).get("message").asString()).contains("playlist");
    }

    @Test
    void adminRoleClaimAlsoWorksAndClearingKeepsServing() throws Exception {
        com.google.firebase.auth.FirebaseToken decoded = org.mockito.Mockito.mock(com.google.firebase.auth.FirebaseToken.class);
        org.mockito.Mockito.when(decoded.getUid()).thenReturn("uid-role-admin");
        org.mockito.Mockito.when(decoded.getClaims()).thenReturn(Map.of("role", "admin"));
        org.mockito.Mockito.doReturn(decoded).when(firebaseAuth).verifyIdToken("token-role-admin");

        long id = createBracket(USER_A, "Cached", 2).get("id").asLong();
        perform(get("/brackets/" + id));
        assertThat(perform(as("token-role-admin", post("/admin/cache/clear"))).getResponse().getStatus()).isEqualTo(204);
        assertThat(perform(get("/brackets/" + id)).getResponse().getStatus()).isEqualTo(200);
        assertThat(perform(as("token-role-admin", post("/admin/cache/clear/youtubeSearch"))).getResponse().getStatus()).isEqualTo(204);
    }
}
