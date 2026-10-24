package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import tools.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class BracketApiIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    // ---- creation ------------------------------------------------------------------------------

    @Test
    void createsBracketWithItemsAtomically() throws Exception {
        JsonNode bracket = createBracket(USER_A, "Best images", 3);

        assertThat(bracket.get("id").asLong()).isPositive();
        assertThat(bracket.get("name").asString()).isEqualTo("Best images");
        assertThat(bracket.get("category").asString()).isEqualTo("Testing");
        assertThat(bracket.has("createdBy")).isFalse();
        assertThat(bracket.get("createdAt").asString()).endsWith("Z");

        JsonNode items = body(perform(get("/brackets/" + bracket.get("id").asLong() + "/items")));
        assertThat(items).hasSize(3);
        assertThat(items.get(0).get("mediaType").asString()).isEqualTo("image");
        assertThat(items.get(0).get("title").asString()).isEqualTo("Item 0");
    }

    @Test
    void sanitizesTextAndDefaultsCategory() throws Exception {
        Map<String, Object> payload = bracketPayload("<b>Bold</b> &amp; brave", "image", 2);
        payload.put("category", "  ");
        payload.put("description", "line one\nline two");
        JsonNode bracket = body(perform(as(USER_A, postJson("/brackets", payload))));

        assertThat(bracket.get("name").asString()).isEqualTo("Bold & brave");
        assertThat(bracket.get("category").asString()).isEqualTo("General");
        assertThat(bracket.get("description").asString()).isEqualTo("line one\nline two");
    }

    @Test
    void rejectsBadEntriesWithFieldErrorsAndCreatesNothing() throws Exception {
        long before = jdbc.queryForObject("SELECT COUNT(*) FROM brackets", Long.class);
        Map<String, Object> payload = bracketPayload("Broken", "video", 3);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = new ArrayList<>((List<Map<String, Object>>) payload.get("items"));
        items.set(1, Map.of("title", "Not YouTube", "mediaUrl", "https://vimeo.com/123456"));
        items.set(2, Map.of("title", "LAN box", "mediaUrl", "https://router.private.example/watch?v=abcdefghijk"));
        payload.put("items", items);

        MvcResult result = perform(as(USER_A, postJson("/brackets", payload)));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = body(result);
        assertThat(body.get("errors").get("items[1].mediaUrl").asString()).startsWith("Entry 2 (\"Not YouTube\"): video entries need a YouTube link");
        assertThat(body.get("errors").get("items[2].mediaUrl").asString()).startsWith("Entry 3 (\"LAN box\"):");
        assertThat(body.get("message").asString()).startsWith("Entry 2");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM brackets", Long.class)).isEqualTo(before);
    }

    @Test
    void rejectsPrivateHostsAndPlainHttp() throws Exception {
        Map<String, Object> payload = bracketPayload("Images", "image", 2);
        payload.put("items", List.of(
                Map.of("title", "Internal", "mediaUrl", "https://files.private.example/cat.png"),
                Map.of("title", "Insecure", "mediaUrl", "http://images.example.com/cat.png")));

        JsonNode errors = body(perform(as(USER_A, postJson("/brackets", payload)))).get("errors");

        assertThat(errors.get("items[0].mediaUrl").asString()).contains("private or reserved");
        assertThat(errors.get("items[1].mediaUrl").asString()).contains("https://");
    }

    @Test
    void beanValidationErrorsAreReportedPerField() throws Exception {
        Map<String, Object> payload = bracketPayload("x".repeat(101), "image", 1);
        JsonNode body = body(perform(as(USER_A, postJson("/brackets", payload))));

        assertThat(body.get("status").asInt()).isEqualTo(400);
        assertThat(body.get("errors").get("name").asString()).contains("100");
        assertThat(body.get("errors").get("items").asString()).contains("between 2 and 500");
    }

    @Test
    void anonymousCannotCreate() throws Exception {
        MvcResult result = perform(postJson("/brackets", bracketPayload("Nope", "image", 2)));
        assertThat(result.getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void invalidTokenIsTreatedAsAnonymous() throws Exception {
        MvcResult result = perform(as("garbage", postJson("/brackets", bracketPayload("Nope", "image", 2))));
        assertThat(result.getResponse().getStatus()).isEqualTo(401);
        assertThat(perform(as("garbage", get("/brackets"))).getResponse().getStatus()).isEqualTo(200);
    }

    // ---- lists ---------------------------------------------------------------------------------

    @Test
    void listsHideBracketsWithFewerThanTwoItems() throws Exception {
        long legacyId = jdbc.queryForObject(
                "INSERT INTO brackets (name, type, category, created_by) VALUES ('Legacy', 'image', 'General', 'uid-a') RETURNING id",
                Long.class);
        jdbc.update("INSERT INTO items (bracket_id, title, media_url, media_type) VALUES (?, 'Only', 'https://x.example/1.png', 'image')", legacyId);
        long playable = createBracket(USER_A, "Playable", 2).get("id").asLong();

        List<Long> all = ids(body(perform(get("/brackets"))));
        List<Long> popular = ids(body(perform(get("/brackets/popular"))));
        List<Long> mine = ids(body(perform(as(USER_A, get("/me/brackets")))));

        assertThat(all).contains(playable).doesNotContain(legacyId);
        assertThat(popular).contains(playable).doesNotContain(legacyId);
        assertThat(mine).contains(playable, legacyId);
        assertThat(all.indexOf(playable)).isZero(); // newest first
    }

    @Test
    void popularOrdersByRunCount() throws Exception {
        long quiet = createBracket(USER_A, "Quiet", 2).get("id").asLong();
        long busy = createBracket(USER_A, "Busy", 2).get("id").asLong();
        List<Long> busyItems = itemIds(busy);
        for (int i = 0; i < 2; i++) {
            perform(postJson("/brackets/" + busy + "/results", runPayload(busyItems, null, null)));
        }

        List<Long> popular = ids(body(perform(get("/brackets/popular"))));
        assertThat(popular.indexOf(busy)).isLessThan(popular.indexOf(quiet));
    }

    // ---- results -------------------------------------------------------------------------------

    @Test
    void guestAndUserCanSubmitAndTokensAreIdempotent() throws Exception {
        long id = createBracket(USER_A, "Runs", 4).get("id").asLong();
        List<Long> ranking = itemIds(id);

        MvcResult guest = perform(postJson("/brackets/" + id + "/results", runPayload(ranking, "guest-token-1", null)));
        assertThat(guest.getResponse().getStatus()).isEqualTo(200);
        JsonNode guestResult = body(guest);
        assertThat(guestResult.has("userId")).isFalse();
        assertThat(guestResult.has("submissionToken")).isFalse();
        // Only the submitter receives a Result, so it carries the run's real matches
        assertThat(guestResult.get("matches")).hasSize(3);
        assertThat(guestResult.has("version")).isFalse();

        JsonNode first = body(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, "user-token-1", null)))));
        JsonNode again = body(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, "user-token-1", null)))));
        assertThat(again.get("id").asLong()).isEqualTo(first.get("id").asLong());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isEqualTo(2);

        MvcResult stolen = perform(as(USER_B, postJson("/brackets/" + id + "/results", runPayload(ranking, "user-token-1", null))));
        assertThat(stolen.getResponse().getStatus()).isEqualTo(409);
        MvcResult guestReuse = perform(postJson("/brackets/" + id + "/results", runPayload(ranking, "user-token-1", null)));
        assertThat(guestReuse.getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void rejectsInvalidRuns() throws Exception {
        long id = createBracket(USER_A, "Strict", 4).get("id").asLong();
        long other = createBracket(USER_A, "Other", 2).get("id").asLong();
        List<Long> r = itemIds(id);
        long foreign = itemIds(other).get(0);

        assertRunRejected(id, Map.of("ranking", List.of(r.get(0)), "matches", List.of(), "submissionToken", "t1"));
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), r.get(0)),
                "matches", List.of(match(r.get(0), r.get(0))), "submissionToken", "t2"));
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), foreign),
                "matches", List.of(match(r.get(0), foreign)), "submissionToken", "t3"));
        // wrong match count
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), r.get(1)), "matches", List.of(), "submissionToken", "t4"));
        // champion loses
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), r.get(1)),
                "matches", List.of(match(r.get(1), r.get(0))), "submissionToken", "t5"));
        // an item loses twice (and the pair repeats)
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), r.get(1), r.get(2), r.get(3)),
                "matches", List.of(match(r.get(0), r.get(1)), match(r.get(0), r.get(1)), match(r.get(2), r.get(3))),
                "submissionToken", "t6"));
        // missing matches
        assertRunRejected(id, Map.of("ranking", List.of(r.get(0), r.get(1)), "submissionToken", "t7"));

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE bracket_id = ?", Long.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM item_stats WHERE bracket_id = ?", Long.class, id)).isZero();
    }

    private void assertRunRejected(long bracketId, Map<String, Object> payload) throws Exception {
        MvcResult result = perform(postJson("/brackets/" + bracketId + "/results", payload));
        assertThat(result.getResponse().getStatus())
                .as("payload %s -> %s", payload, result.getResponse().getContentAsString())
                .isEqualTo(400);
    }

    private static Map<String, Long> match(long winner, long loser) {
        return Map.of("winnerId", winner, "loserId", loser);
    }

    @Test
    void submittingToUnknownBracketIs404() throws Exception {
        MvcResult result = perform(postJson("/brackets/987654321/results", runPayload(List.of(1L, 2L), null, null)));
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(body(result).get("message").asString()).isEqualTo("Bracket not found");
    }

    // ---- rankings ------------------------------------------------------------------------------

    @Test
    void rankingsMatchHandComputedValuesAndAreFreshAfterEachRun() throws Exception {
        long id = createBracket(USER_A, "Ranked", 4).get("id").asLong();
        List<Long> items = itemIds(id);
        long a = items.get(0), b = items.get(1), c = items.get(2), d = items.get(3);

        submit(id, List.of(a, b, c, d));   // A>B, A>C, B>D
        submit(id, List.of(b, a, d, c));   // B>A, B>D, A>C
        JsonNode beforeThird = body(perform(get("/brackets/" + id + "/rankings")));
        // A and B tie on score (5/6), win rate (75%) and appearances, so the lower id wins the tie
        assertThat(beforeThird.get(0).get("item").get("id").asLong()).isEqualTo(a);

        submit(id, List.of(a, c));          // 2-entry run: A>C

        JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
        assertThat(rankings).hasSize(4);
        assertRanking(rankings.get(0), a, 4, 5, 80, (1 + 2.0 / 3 + 1) / 3, 3);
        assertRanking(rankings.get(1), b, 3, 4, 75, (2.0 / 3 + 1) / 2, 2);
        assertRanking(rankings.get(2), d, 0, 2, 0, (0 + 1.0 / 3) / 2, 2);
        assertRanking(rankings.get(3), c, 0, 3, 0, (1.0 / 3 + 0 + 0) / 3, 3);
    }

    private void submit(long bracketId, List<Long> ranking) throws Exception {
        MvcResult result = perform(postJson("/brackets/" + bracketId + "/results", runPayload(ranking, null, null)));
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200);
    }

    private static void assertRanking(JsonNode row, long itemId, long wins, long matches, int winPct, double avg, int times) {
        assertThat(row.get("item").get("id").asLong()).isEqualTo(itemId);
        assertThat(row.get("wins").asLong()).isEqualTo(wins);
        assertThat(row.get("totalMatches").asLong()).isEqualTo(matches);
        assertThat(row.get("winPercentage").asInt()).isEqualTo(winPct);
        assertThat(row.get("averageScore").asDouble()).isCloseTo(avg, within(1e-9));
        assertThat(row.get("timesRanked").asInt()).isEqualTo(times);
    }

    // ---- comments ------------------------------------------------------------------------------

    @Test
    void commentsAreNewestFirstCappedAndAnonymous() throws Exception {
        long id = createBracket(USER_A, "Chatty", 2).get("id").asLong();
        List<Long> ranking = itemIds(id);
        perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, null, null)))); // no comment
        for (int i = 0; i < 55; i++) {
            perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, null, "comment " + i))));
        }

        JsonNode comments = body(perform(get("/brackets/" + id + "/comments")));

        assertThat(comments).hasSize(50);
        assertThat(comments.get(0).get("comment").asString()).isEqualTo("comment 54");
        assertThat(comments.get(0).get("displayName").asString()).isEqualTo("Tester");
        assertThat(comments.get(0).get("championItemId").asLong()).isEqualTo(ranking.get(0));
        assertThat(comments.get(0).has("userId")).isFalse();
        assertThat(comments.get(0).has("submissionToken")).isFalse();
        assertThat(comments.toString()).doesNotContain("uid-a");
    }

    @Test
    void oldPublicResultsEndpointIsGone() throws Exception {
        long id = createBracket(USER_A, "Gone", 2).get("id").asLong();
        assertThat(perform(get("/brackets/" + id + "/results")).getResponse().getStatus()).isEqualTo(401);
        assertThat(perform(as(USER_A, get("/brackets/" + id + "/results"))).getResponse().getStatus()).isEqualTo(405);
    }

    // ---- /me -----------------------------------------------------------------------------------

    @Test
    void meEndpointsReturnOnlyTheCallersData() throws Exception {
        long id = createBracket(USER_C, "Mine", 2).get("id").asLong();
        long other = createBracket(USER_B, "Theirs", 2).get("id").asLong();
        List<Long> ranking = itemIds(id);
        JsonNode first = body(perform(as(USER_C, postJson("/brackets/" + id + "/results", runPayload(ranking, null, null)))));
        perform(as(USER_B, postJson("/brackets/" + id + "/results", runPayload(ranking, null, null))));
        perform(as(USER_C, postJson("/brackets/" + other + "/results", runPayload(itemIds(other), null, null))));

        List<Long> myBrackets = ids(body(perform(as(USER_C, get("/me/brackets")))));
        assertThat(myBrackets).contains(id).doesNotContain(other);

        JsonNode allMine = body(perform(as(USER_C, get("/me/results"))));
        assertThat(allMine).hasSize(2);
        JsonNode mineHere = body(perform(as(USER_C, get("/me/results").param("bracketId", Long.toString(id)))));
        assertThat(mineHere).hasSize(1);
        assertThat(mineHere.get(0).get("id").asLong()).isEqualTo(first.get("id").asLong());

        // Cached history is refreshed by the next submission
        perform(as(USER_C, postJson("/brackets/" + id + "/results", runPayload(ranking, null, null))));
        assertThat(body(perform(as(USER_C, get("/me/results").param("bracketId", Long.toString(id)))))).hasSize(2);
        assertThat(body(perform(as(USER_C, get("/me/results"))))).hasSize(3);

        assertThat(perform(get("/me/results")).getResponse().getStatus()).isEqualTo(401);
        assertThat(perform(get("/me/brackets")).getResponse().getStatus()).isEqualTo(401);
    }

    // ---- errors and headers -----------------------------------------------------------------

    @Test
    void errorStatusesAreCorrect() throws Exception {
        assertThat(perform(get("/brackets/987654321")).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(get("/brackets/987654321/items")).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(get("/brackets/987654321/rankings")).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(get("/brackets/987654321/comments")).getResponse().getStatus()).isEqualTo(404);

        MvcResult typeMismatch = perform(get("/brackets/abc"));
        assertThat(typeMismatch.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(typeMismatch).get("message").asString()).isEqualTo("Invalid value for 'id'");

        MvcResult malformed = perform(post("/brackets/1/results").contentType(MediaType.APPLICATION_JSON).content("{not json"));
        assertThat(malformed.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(malformed).get("message").asString()).isEqualTo("Malformed request body");
        assertThat(body(malformed).get("error").asString()).isEqualTo("Bad Request");

        assertThat(perform(as(USER_A, delete("/brackets/1"))).getResponse().getStatus()).isEqualTo(405);
        assertThat(perform(as(USER_A, get("/no-such-route"))).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(as(USER_A, post("/brackets").contentType(MediaType.TEXT_PLAIN).content("x")))
                .getResponse().getStatus()).isEqualTo(415);
    }

    @Test
    void adminCacheEndpointsRequireAdmin() throws Exception {
        assertThat(perform(post("/admin/cache/clear")).getResponse().getStatus()).isEqualTo(401);
        MvcResult forbidden = perform(as(USER_A, post("/admin/cache/clear")));
        assertThat(forbidden.getResponse().getStatus()).isEqualTo(403);
        assertThat(body(forbidden).get("status").asInt()).isEqualTo(403);

        assertThat(perform(as(ADMIN, post("/admin/cache/clear"))).getResponse().getStatus()).isEqualTo(204);
        assertThat(perform(as(ADMIN, post("/admin/cache/clear/brackets"))).getResponse().getStatus()).isEqualTo(204);
        assertThat(perform(as(ADMIN, post("/admin/cache/clear/typo"))).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void actuatorExposesOnlyHealthAndInfo() throws Exception {
        assertThat(perform(get("/actuator/health")).getResponse().getStatus()).isEqualTo(200);
        assertThat(perform(get("/actuator/health/readiness")).getResponse().getStatus()).isEqualTo(200);
        assertThat(perform(as(USER_A, get("/actuator/caches"))).getResponse().getStatus()).isEqualTo(404);
        assertThat(perform(as(USER_A, delete("/actuator/caches"))).getResponse().getStatus()).isIn(404, 405);
    }

    @Test
    void publicResponsesAreNotBrowserCached() throws Exception {
        long id = createBracket(USER_A, "Fresh", 2).get("id").asLong();
        for (String path : List.of("/brackets", "/brackets/popular", "/brackets/" + id, "/brackets/" + id + "/rankings")) {
            MvcResult result = perform(get(path));
            assertThat(result.getResponse().getHeader("Cache-Control")).as(path).contains("no-store");
        }
        MvcResult result = perform(get("/brackets"));
        assertThat(result.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(result.getResponse().getHeader("Referrer-Policy")).isEqualTo("strict-origin-when-cross-origin");
        assertThat(result.getResponse().getHeader("Content-Security-Policy")).isNull();
    }

    @Test
    void metadataLookupsRequireSignIn() throws Exception {
        assertThat(perform(get("/metadata/youtube/search").param("query", "x")).getResponse().getStatus()).isEqualTo(401);
        assertThat(perform(get("/metadata/spotify/playlist").param("url", "https://open.spotify.com/playlist/abc"))
                .getResponse().getStatus()).isEqualTo(401);
        MvcResult badUrl = perform(as(USER_A, get("/metadata/spotify/playlist").param("url", "https://spotify.link/abc")));
        assertThat(badUrl.getResponse().getStatus()).isEqualTo(400);
        assertThat(body(badUrl).get("message").asString()).contains("spotify.link");
    }

    // ---- CORS and proxies ----------------------------------------------------------------------

    @Test
    void sameOriginPostThroughHttpsTunnelIsAccepted() throws Exception {
        long id = createBracket(USER_A, "Tunnel", 2).get("id").asLong();
        MvcResult result = perform(postJson("/brackets/" + id + "/results", runPayload(itemIds(id), null, null))
                .header("Host", "abc.trycloudflare.com")
                .header("Origin", "https://abc.trycloudflare.com")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Port", "443"));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void crossOriginRequestsNeedAnAllowedOrigin() throws Exception {
        MvcResult allowed = perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/brackets")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type"));
        assertThat(allowed.getResponse().getStatus()).isEqualTo(200);
        assertThat(allowed.getResponse().getHeader("Access-Control-Allow-Origin")).isEqualTo("http://localhost:3000");
        assertThat(allowed.getResponse().getHeader("Access-Control-Allow-Credentials")).isNull();

        MvcResult denied = perform(postJson("/brackets/1/results", Map.of()).header("Origin", "https://evil.example"));
        assertThat(denied.getResponse().getStatus()).isEqualTo(403);
    }

    private static List<Long> ids(JsonNode array) {
        List<Long> ids = new ArrayList<>();
        array.forEach(n -> ids.add(n.get("id").asLong()));
        return ids;
    }
}
