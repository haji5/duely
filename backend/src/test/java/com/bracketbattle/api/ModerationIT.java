package com.bracketbattle.api;

import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.service.StatsService;
import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Moderation and ownership: deleting and hiding brackets, removing comments and runs, reports,
 * and deleting an account's data. Each endpoint is tried as a guest, another user, the owner and
 * an admin.
 */
class ModerationIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ItemStatsRepository itemStats;

    @Autowired
    StatsService statsService;

    // ---- deleting a bracket ------------------------------------------------------------------

    @Test
    void onlyTheOwnerOrAnAdminMayDeleteABracket() throws Exception {
        long owned = createBracket(USER_A, "Mine to delete", 4).get("id").asLong();

        assertThat(status(delete("/brackets/" + owned), null)).isEqualTo(401);
        assertThat(status(delete("/brackets/" + owned), USER_B)).isEqualTo(403);
        assertThat(status(get("/brackets/" + owned), null)).isEqualTo(200);

        assertThat(status(delete("/brackets/" + owned), USER_A)).isEqualTo(204);
        assertThat(status(get("/brackets/" + owned), null)).isEqualTo(404);
        assertThat(status(delete("/brackets/" + owned), USER_A)).isEqualTo(404);

        long other = createBracket(USER_B, "Someone else's", 2).get("id").asLong();
        assertThat(status(delete("/brackets/" + other), ADMIN)).isEqualTo(204);
        assertThat(status(delete("/brackets/987654321"), ADMIN)).isEqualTo(404);
    }

    @Test
    void deletingABracketTakesItsEntriesRunsAndLeaderboardWithItAndEvictsTheCaches() throws Exception {
        long id = createBracket(USER_A, "Cascade", 4).get("id").asLong();
        List<Long> items = itemIds(id);
        submit(USER_B, id, items, "nice one");
        submit(null, id, items, null);
        long report = fileReport(null, "bracket", id);
        long kept = createBracket(USER_A, "Kept", 2).get("id").asLong();

        warmCaches(id, USER_B);
        assertThat(redis.hasKey(key("bracket", id))).isTrue();
        assertThat(redis.hasKey(key("userResults", "uid-b:" + id))).isTrue();

        assertThat(status(delete("/brackets/" + id), USER_A)).isEqualTo(204);

        for (String table : List.of("items", "results", "item_stats")) {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE bracket_id = ?", Long.class, id))
                    .as(table).isZero();
        }
        for (String cache : List.of("bracket", "bracketItems", "bracketRankings", "bracketComments")) {
            assertThat(redis.hasKey(key(cache, id))).as(cache).isFalse();
        }
        assertThat(redis.hasKey(key("userResults", "uid-b:" + id))).isFalse();
        assertThat(publicIds()).doesNotContain(id).contains(kept);
        for (String path : List.of("", "/items", "/rankings", "/stats", "/comments")) {
            assertThat(status(get("/brackets/" + id + path), null)).as(path).isEqualTo(404);
        }
        assertThat(body(perform(as(USER_B, get("/me/results").param("bracketId", Long.toString(id)))))).isEmpty();
        assertThat(resolvedAt(report)).isNotNull();
    }

    // ---- hiding a bracket --------------------------------------------------------------------

    @Test
    void onlyAdminsMayHideAndUnhide() throws Exception {
        long id = createBracket(USER_A, "Hide me", 2).get("id").asLong();
        for (String action : List.of("hide", "unhide")) {
            String path = "/admin/brackets/" + id + "/" + action;
            assertThat(status(post(path), null)).as(action).isEqualTo(401);
            assertThat(status(post(path), USER_B)).as(action).isEqualTo(403);
            assertThat(status(post(path), USER_A)).as(action + " by the owner").isEqualTo(403);
            assertThat(status(post(path), ADMIN)).as(action).isEqualTo(204);
            assertThat(status(post("/admin/brackets/987654321/" + action), ADMIN)).isEqualTo(404);
        }
    }

    @Test
    void aHiddenBracketIsGoneFromEveryPublicRouteButStaysVisibleToItsOwnerAndAdmins() throws Exception {
        long id = createBracket(USER_A, "Hidden gem", 4).get("id").asLong();
        List<Long> items = itemIds(id);
        long resultId = submit(USER_B, id, items, "comment on a hidden bracket");
        warmCaches(id, USER_B);
        assertThat(publicIds()).contains(id);
        assertThat(perform(get("/sitemap.xml")).getResponse().getContentAsString()).contains("/bracket/" + id + "<");
        assertThat(perform(get("/home")).getResponse().getContentAsString()).contains("Hidden gem");

        assertThat(status(post("/admin/brackets/" + id + "/hide"), ADMIN)).isEqualTo(204);

        assertThat(redis.hasKey(key("bracket", id))).isFalse();
        assertThat(publicIds()).doesNotContain(id);
        assertThat(idsOf(body(perform(get("/brackets").param("sort", "popular").param("q", "Hidden gem"))).get("items"))).isEmpty();
        assertThat(perform(get("/home")).getResponse().getContentAsString()).doesNotContain("Hidden gem");
        String sitemap = perform(get("/sitemap.xml")).getResponse().getContentAsString();
        assertThat(sitemap).doesNotContain("/bracket/" + id + "<").doesNotContain("/results/" + id + "<");
        for (String token : new String[]{null, USER_B}) {
            for (String path : List.of("", "/items", "/rankings", "/stats", "/comments")) {
                assertThat(status(get("/brackets/" + id + path), token)).as(path + " as " + token).isEqualTo(404);
            }
            assertThat(status(postJson("/brackets/" + id + "/runs", Map.of("size", 4)), token)).isEqualTo(404);
            assertThat(status(postJson("/brackets/" + id + "/results", runPayload(items, null, null)), token)).isEqualTo(404);
            assertThat(status(postJson("/reports", report("bracket", id)), token)).isEqualTo(404);
            assertThat(status(postJson("/reports", report("comment", resultId)), token)).isEqualTo(404);
            assertThat(status(delete("/brackets/" + id), token)).isEqualTo(token == null ? 401 : 404);
        }
        // Pages carry no token, so they are a 404 for everyone (the shell then loads it via the API).
        for (String path : List.of("/pages/bracket/" + id, "/pages/results/" + id)) {
            MvcResult page = perform(get(path));
            assertThat(page.getResponse().getStatus()).as(path).isEqualTo(404);
            assertThat(page.getResponse().getContentAsString()).doesNotContain("Hidden gem");
        }

        for (String token : List.of(USER_A, ADMIN)) {
            MvcResult own = perform(as(token, get("/brackets/" + id)));
            assertThat(own.getResponse().getStatus()).isEqualTo(200);
            assertThat(body(own).get("hiddenAt").isNull()).isFalse();
            assertThat(status(get("/brackets/" + id + "/rankings"), token)).isEqualTo(200);
        }
        JsonNode mine = body(perform(as(USER_A, get("/me/brackets")))).get("items");
        assertThat(mine).anySatisfy(b -> {
            assertThat(b.get("id").asLong()).isEqualTo(id);
            assertThat(b.get("hiddenAt").isNull()).isFalse();
        });

        assertThat(status(post("/admin/brackets/" + id + "/unhide"), ADMIN)).isEqualTo(204);
        assertThat(publicIds()).contains(id);
        assertThat(body(perform(get("/brackets/" + id))).get("hiddenAt").isNull()).isTrue();
        assertThat(perform(get("/pages/bracket/" + id)).getResponse().getStatus()).isEqualTo(200);
    }

    // ---- comments and runs -------------------------------------------------------------------

    @Test
    void anAdminClearsACommentAndKeepsTheRun() throws Exception {
        long id = createBracket(USER_A, "Rude comment", 4).get("id").asLong();
        List<Long> items = itemIds(id);
        long resultId = submit(USER_B, id, items, "something rude");
        long report = fileReport(USER_C, "comment", resultId);
        warmCaches(id, USER_B);
        Map<Long, ItemStatsRepository.Totals> before = itemStats.findTotals(id);

        String path = "/admin/results/" + resultId + "/comment";
        assertThat(status(delete(path), null)).isEqualTo(401);
        assertThat(status(delete(path), USER_B)).isEqualTo(403);
        assertThat(status(delete(path), USER_A)).isEqualTo(403);
        assertThat(status(delete(path), ADMIN)).isEqualTo(204);
        assertThat(status(delete("/admin/results/987654321/comment"), ADMIN)).isEqualTo(404);

        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();
        JsonNode own = body(perform(as(USER_B, get("/me/results").param("bracketId", Long.toString(id)))));
        assertThat(own).hasSize(1);
        assertThat(own.get(0).get("comment").isNull()).isTrue();
        assertThat(own.get(0).get("displayName").isNull()).isTrue();
        assertThat(itemStats.findTotals(id)).isEqualTo(before);
        assertThat(body(perform(get("/brackets/" + id + "/stats"))).get("runCount").asLong()).isEqualTo(1);
        assertThat(resolvedAt(report)).isNotNull();
    }

    @Test
    void deletingARunLeavesTheLeaderboardAFreshRebuildWouldGive() throws Exception {
        long id = createBracket(USER_A, "Remove a run", 8).get("id").asLong();
        List<Long> items = itemIds(id);
        List<Long> reversed = new ArrayList<>(items).reversed();
        submit(USER_A, id, items, null);
        long abusive = submit(USER_B, id, reversed, "spam spam");
        submit(null, id, items.subList(0, 4), null);
        warmCaches(id, USER_B);

        String path = "/admin/results/" + abusive;
        assertThat(status(delete(path), null)).isEqualTo(401);
        assertThat(status(delete(path), USER_B)).isEqualTo(403);
        assertThat(status(delete(path), USER_A)).isEqualTo(403);
        assertThat(status(delete(path), ADMIN)).isEqualTo(204);
        assertThat(status(delete(path), ADMIN)).isEqualTo(404);

        Map<Long, ItemStatsRepository.Totals> afterDelete = itemStats.findTotals(id);
        statsService.rebuild(id);
        assertThat(itemStats.findTotals(id)).isEqualTo(afterDelete);
        // Two runs left: the eight entries of the first, four of them again in the third.
        assertThat(afterDelete.values().stream().mapToLong(ItemStatsRepository.Totals::timesRanked).sum()).isEqualTo(12);

        assertThat(body(perform(get("/brackets/" + id + "/stats"))).get("runCount").asLong()).isEqualTo(2);
        JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
        assertThat(rankings.get(0).get("item").get("id").asLong()).isEqualTo(items.get(0));
        assertThat(body(perform(get("/brackets/" + id + "/comments")))).isEmpty();
        assertThat(body(perform(as(USER_B, get("/me/results").param("bracketId", Long.toString(id)))))).isEmpty();
    }

    // ---- reports -----------------------------------------------------------------------------

    @Test
    void anyoneCanReportAndOnlyAdminsSeeAndResolveTheQueue() throws Exception {
        long id = createBracket(USER_A, "Reported", 4).get("id").asLong();
        long resultId = submit(USER_B, id, itemIds(id), "a comment someone dislikes");

        assertThat(status(postJson("/reports", Map.of("targetType", "bracket", "targetId", id, "reason", "spam",
                "details", "  Selling things  ")), null)).isEqualTo(204);
        assertThat(status(postJson("/reports", report("comment", resultId)), USER_C)).isEqualTo(204);

        // Bad requests
        assertThat(status(postJson("/reports", Map.of("targetType", "user", "targetId", id, "reason", "spam")), null)).isEqualTo(400);
        assertThat(status(postJson("/reports", Map.of("targetType", "bracket", "targetId", id, "reason", "boring")), null)).isEqualTo(400);
        assertThat(status(postJson("/reports", Map.of("targetType", "bracket", "targetId", id)), null)).isEqualTo(400);
        assertThat(status(postJson("/reports", Map.of("targetType", "bracket", "targetId", id, "reason", "spam",
                "details", "x".repeat(501))), null)).isEqualTo(400);
        assertThat(status(postJson("/reports", report("bracket", 987654321)), null)).isEqualTo(404);
        long silent = submit(USER_C, id, itemIds(id), null);
        assertThat(status(postJson("/reports", report("comment", silent)), null)).as("a run without a comment").isEqualTo(404);

        assertThat(status(get("/admin/reports"), null)).isEqualTo(401);
        assertThat(status(get("/admin/reports"), USER_A)).isEqualTo(403);
        MvcResult listed = perform(as(ADMIN, get("/admin/reports")));
        assertThat(listed.getResponse().getStatus()).isEqualTo(200);
        String raw = listed.getResponse().getContentAsString();
        assertThat(raw).doesNotContain("uid-c").doesNotContain("reporter");
        List<JsonNode> queue = about(id, body(listed)); // other tests' reports share the table
        assertThat(queue).hasSize(2);
        JsonNode commentReport = queue.get(0); // newest first
        assertThat(commentReport.get("targetType").asString()).isEqualTo("comment");
        assertThat(commentReport.get("comment").asString()).isEqualTo("a comment someone dislikes");
        assertThat(commentReport.get("bracketId").asLong()).isEqualTo(id);
        JsonNode bracketReport = queue.get(1);
        assertThat(bracketReport.get("bracketName").asString()).isEqualTo("Reported");
        assertThat(bracketReport.get("details").asString()).isEqualTo("Selling things");
        assertThat(bracketReport.get("bracketHidden").asBoolean()).isFalse();

        long reportId = commentReport.get("id").asLong();
        String resolve = "/admin/reports/" + reportId + "/resolve";
        assertThat(status(post(resolve), null)).isEqualTo(401);
        assertThat(status(post(resolve), USER_B)).isEqualTo(403);
        assertThat(status(post(resolve), ADMIN)).isEqualTo(204);
        assertThat(status(post("/admin/reports/987654321/resolve"), ADMIN)).isEqualTo(404);
        assertThat(about(id, body(perform(as(ADMIN, get("/admin/reports")))))).hasSize(1);
        assertThat(about(id, body(perform(as(ADMIN, get("/admin/reports").param("open", "false")))))).hasSize(2);

        // Hiding the bracket deals with the report about it.
        assertThat(status(post("/admin/brackets/" + id + "/hide"), ADMIN)).isEqualTo(204);
        assertThat(about(id, body(perform(as(ADMIN, get("/admin/reports")))))).isEmpty();
        List<JsonNode> all = about(id, body(perform(as(ADMIN, get("/admin/reports").param("open", "false")))));
        assertThat(all.get(1).get("bracketHidden").asBoolean()).isTrue();
        assertThat(all.get(1).get("resolvedAt").isNull()).isFalse();
    }

    @Test
    void reportingACommentOnAHiddenBracketLooksLikeReportingOneThatDoesNotExist() throws Exception {
        long id = createBracket(USER_A, "Hidden comments", 4).get("id").asLong();
        long commentId = submit(null, id, itemIds(id), "a guest's comment");
        assertThat(status(post("/admin/brackets/" + id + "/hide"), ADMIN)).isEqualTo(204);

        MvcResult hidden = perform(postJson("/reports", report("comment", commentId)));
        MvcResult missing = perform(postJson("/reports", report("comment", 987654321)));
        assertThat(hidden.getResponse().getStatus()).isEqualTo(404);
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        assertThat(body(hidden).get("message").asString())
                .isEqualTo(body(missing).get("message").asString())
                .isEqualTo("Comment not found");

        // The owner and admins still see the bracket, so they can still report the comment.
        assertThat(status(postJson("/reports", report("comment", commentId)), USER_A)).isEqualTo(204);
        assertThat(status(postJson("/reports", report("comment", commentId)), ADMIN)).isEqualTo(204);
    }

    // ---- deleting an account's data ----------------------------------------------------------

    @Test
    void deletingMyDataAnonymisesMyRunsAndRemovesMyUnplayedBrackets() throws Exception {
        long unplayed = createBracket(USER_C, "Nobody played this", 2).get("id").asLong();
        long playedBySelf = createBracket(USER_C, "Only I played this", 2).get("id").asLong();
        long playedByOthers = createBracket(USER_C, "Others played this", 4).get("id").asLong();
        long elsewhere = createBracket(USER_A, "Someone else's bracket", 4).get("id").asLong();
        submit(USER_C, playedBySelf, itemIds(playedBySelf), null);
        submit(USER_A, playedByOthers, itemIds(playedByOthers), null);
        long myRun = submit(USER_C, elsewhere, itemIds(elsewhere), "my name and words");
        fileReport(USER_C, "bracket", elsewhere);
        long aboutMyComment = fileReport(USER_A, "comment", myRun);
        warmCaches(elsewhere, USER_C);
        Map<Long, ItemStatsRepository.Totals> leaderboard = itemStats.findTotals(elsewhere);

        assertThat(status(delete("/me"), null)).isEqualTo(401);
        assertThat(status(delete("/me"), USER_C)).isEqualTo(204);

        assertThat(status(get("/brackets/" + unplayed), null)).isEqualTo(404);
        assertThat(status(get("/brackets/" + playedBySelf), null)).isEqualTo(404);
        assertThat(status(get("/brackets/" + playedByOthers), null)).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT created_by FROM brackets WHERE id = ?", String.class, playedByOthers)).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM results WHERE user_id = 'uid-c'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reports WHERE reporter_uid = 'uid-c'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM brackets WHERE created_by = 'uid-c'", Long.class)).isZero();

        // The run stays on the leaderboard, without the name and comment.
        assertThat(jdbc.queryForObject("SELECT comment FROM results WHERE id = ?", String.class, myRun)).isNull();
        assertThat(itemStats.findTotals(elsewhere)).isEqualTo(leaderboard);
        assertThat(body(perform(get("/brackets/" + elsewhere + "/comments")))).isEmpty();
        assertThat(body(perform(as(USER_C, get("/me/results").param("bracketId", Long.toString(elsewhere)))))).isEmpty();
        assertThat(body(perform(as(USER_C, get("/me/brackets")))).get("total").asLong()).isZero();
        assertThat(resolvedAt(aboutMyComment)).isNotNull();
        // Twice is fine.
        assertThat(status(delete("/me"), USER_C)).isEqualTo(204);
    }

    // ---- helpers -----------------------------------------------------------------------------

    private int status(MockHttpServletRequestBuilder request, String token) throws Exception {
        return perform(as(token, request)).getResponse().getStatus();
    }

    private long submit(String token, long bracketId, List<Long> ranking, String comment) throws Exception {
        MvcResult result = perform(as(token, postJson("/brackets/" + bracketId + "/results", runPayload(ranking, null, comment))));
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200);
        return body(result).get("id").asLong();
    }

    private static Map<String, Object> report(String targetType, long targetId) {
        return Map.of("targetType", targetType, "targetId", targetId, "reason", "harassment");
    }

    private long fileReport(String token, String targetType, long targetId) throws Exception {
        assertThat(status(postJson("/reports", report(targetType, targetId)), token)).isEqualTo(204);
        return jdbc.queryForObject("SELECT MAX(id) FROM reports", Long.class);
    }

    private java.sql.Timestamp resolvedAt(long reportId) {
        return jdbc.queryForObject("SELECT resolved_at FROM reports WHERE id = ?", java.sql.Timestamp.class, reportId);
    }

    /** Reads everything the bracket's pages read, so each cache holds an entry to evict. */
    private void warmCaches(long bracketId, String player) throws Exception {
        for (String path : List.of("", "/items", "/rankings", "/stats", "/comments")) {
            perform(get("/brackets/" + bracketId + path));
        }
        perform(get("/brackets"));
        perform(get("/home"));
        perform(as(player, get("/me/results").param("bracketId", Long.toString(bracketId))));
    }

    private static String key(String cache, Object key) {
        return "duely:v8:" + cache + "::" + key;
    }

    private List<Long> publicIds() throws Exception {
        return idsOf(body(perform(get("/brackets").param("size", "50"))).get("items"));
    }

    /** The reports in a queue that concern one bracket or the comments on it, in queue order. */
    private static List<JsonNode> about(long bracketId, JsonNode queue) {
        List<JsonNode> reports = new ArrayList<>();
        queue.forEach(r -> {
            if (!r.get("bracketId").isNull() && r.get("bracketId").asLong() == bracketId) reports.add(r);
        });
        return reports;
    }

    private static List<Long> idsOf(JsonNode brackets) {
        List<Long> ids = new ArrayList<>();
        brackets.forEach(b -> ids.add(b.get("id").asLong()));
        return ids;
    }
}
