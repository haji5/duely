package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import com.google.firebase.auth.FirebaseToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Paged, filtered and searched lists against a few hundred brackets. The brackets are written
 * straight to the table (creating them through the API is covered elsewhere and would take
 * minutes) with deliberate ties in created_at, run_count and name, so every order has to fall
 * back on the id to page cleanly. Each test scopes itself with a word only its brackets carry,
 * since other test classes share the database.
 */
class BracketListIT extends IntegrationTest {

    private static final String OWNER_TOKEN = "token-lists";
    private static final String OWNER = "uid-lists";
    private static final int COUNT = 300;
    private static final List<String> TYPES = List.of("song", "video", "image");
    private static final List<String> CATEGORIES = List.of("Music", "Sports", "Gaming", "Food");

    @Autowired
    JdbcTemplate jdbc;

    /** A seeded bracket as the list should show it. */
    record Row(long id, String name, String description, String type, String category, Instant createdAt,
               long runCount, boolean hidden, int itemCount, boolean owned) {
        boolean listed() { return !hidden && itemCount >= 2; }
    }

    // Seeded once for the class: the rows are only read.
    private static String marker;
    private static String descriptionWord;
    private static List<Row> rows;

    @BeforeEach
    void seed() throws Exception {
        FirebaseToken decoded = mock(FirebaseToken.class);
        when(decoded.getUid()).thenReturn(OWNER);
        when(decoded.getClaims()).thenReturn(Map.of());
        doReturn(decoded).when(firebaseAuth).verifyIdToken(OWNER_TOKEN);

        if (rows != null) return;
        String unique = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        marker = "mk" + unique;
        descriptionWord = "dw" + unique;
        List<Row> seeded = new ArrayList<>();
        Instant base = Instant.now().truncatedTo(ChronoUnit.MILLIS).minus(Duration.ofDays(1));
        for (int i = 0; i < COUNT; i++) {
            // "B..." and "a...": byte order would put every capital first, the list must not.
            String name = (i % 2 == 0 ? "B" : "a") + String.format("%03d", (i * 7) % 50) + " " + marker;
            String description = i % 10 == 0 ? "Mentions " + descriptionWord + " here" : "Plain";
            String type = TYPES.get(i % 3);
            String category = CATEGORIES.get(i % 4);
            Instant createdAt = base.plus(Duration.ofMinutes(i / 3)); // three brackets per instant
            long runCount = (i * 37L) % 11;
            boolean hidden = i % 25 == 0;
            int itemCount = i % 30 == 5 ? 1 : 2 + i % 5;
            boolean owned = i % 5 == 0;
            long id = jdbc.queryForObject("""
                    INSERT INTO brackets (name, description, type, category, created_at, created_by, hidden_at, item_count, run_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                    """, Long.class, name, description, type, category, Timestamp.from(createdAt),
                    owned ? OWNER : "uid-someone", hidden ? Timestamp.from(base) : null, itemCount, runCount);
            seeded.add(new Row(id, name, description, type, category, createdAt, runCount, hidden, itemCount, owned));
        }
        rows = List.copyOf(seeded);
    }

    // ---- paging and order --------------------------------------------------------------------

    @Test
    void everySortPagesThroughTheMatchesExactlyOnceInOrder() throws Exception {
        List<Row> listed = rows.stream().filter(Row::listed).toList();
        assertThat(listed).hasSizeBetween(250, 290);

        assertThat(allPages(Map.of("q", marker, "size", "50")))
                .containsExactlyElementsOf(ids(sorted(listed, NEWEST)));
        assertThat(allPages(Map.of("q", marker, "sort", "oldest", "size", "17")))
                .containsExactlyElementsOf(ids(sorted(listed, NEWEST.reversed())));
        assertThat(allPages(Map.of("q", marker, "sort", "popular", "size", "50")))
                .containsExactlyElementsOf(ids(sorted(listed, POPULAR)));
        assertThat(allPages(Map.of("q", marker, "sort", "name", "size", "24")))
                .containsExactlyElementsOf(ids(sorted(listed, NAME)));
    }

    @Test
    void aPageCarriesItsPositionTheTotalAndTheCounters() throws Exception {
        List<Row> listed = sorted(rows.stream().filter(Row::listed).toList(), NEWEST);
        JsonNode page = list(Map.of("q", marker, "page", "2", "size", "10"));
        assertThat(page.get("page").asInt()).isEqualTo(2);
        assertThat(page.get("size").asInt()).isEqualTo(10);
        assertThat(page.get("total").asLong()).isEqualTo(listed.size());
        assertThat(ids(page.get("items"))).containsExactlyElementsOf(ids(listed.subList(20, 30)));
        JsonNode first = page.get("items").get(0);
        assertThat(first.get("itemCount").asInt()).isEqualTo(listed.get(20).itemCount());
        assertThat(first.get("runCount").asLong()).isEqualTo(listed.get(20).runCount());
        assertThat(first.has("createdBy")).isFalse();
        assertThat(first.has("lastRunAt")).isFalse();

        // Past the end: no rows, same total.
        JsonNode beyond = list(Map.of("q", marker, "page", "100", "size", "10"));
        assertThat(beyond.get("items")).isEmpty();
        assertThat(beyond.get("total").asLong()).isEqualTo(listed.size());
        // Too big a page is capped, not refused.
        assertThat(list(Map.of("q", marker, "size", "500")).get("size").asInt()).isEqualTo(50);
        assertThat(list(Map.of("q", marker, "size", "500")).get("items")).hasSize(50);
    }

    @Test
    void unfilteredPagesCoverEveryListedBracketOnce() throws Exception {
        long listedInDatabase = jdbc.queryForObject(
                "SELECT COUNT(*) FROM brackets WHERE hidden_at IS NULL AND item_count >= 2", Long.class);
        List<Long> all = allPages(Map.of("size", "50"));
        assertThat(all).hasSize((int) listedInDatabase).doesNotHaveDuplicates();
        assertThat(list(Map.of()).get("total").asLong()).isEqualTo(listedInDatabase);
        assertThat(list(Map.of()).get("size").asInt()).isEqualTo(24);
    }

    // ---- filters and search ------------------------------------------------------------------

    @Test
    void filtersCombineWithTheSearch() throws Exception {
        assertThat(allPages(Map.of("q", marker, "type", "video", "size", "50")))
                .containsExactlyElementsOf(ids(expected(r -> r.type().equals("video"), NEWEST)));
        assertThat(allPages(Map.of("q", marker, "category", "Music", "sort", "popular", "size", "50")))
                .containsExactlyElementsOf(ids(expected(r -> r.category().equals("Music"), POPULAR)));
        // Case-insensitive, for the category name too.
        assertThat(allPages(Map.of("q", marker, "type", "song", "category", "gaming", "size", "50")))
                .containsExactlyElementsOf(ids(expected(r -> r.type().equals("song") && r.category().equals("Gaming"), NEWEST)));
    }

    @Test
    void searchMatchesNameOrDescriptionIgnoringCase() throws Exception {
        assertThat(allPages(Map.of("q", marker.toUpperCase(Locale.ROOT), "size", "50")))
                .containsExactlyElementsOf(ids(expected(r -> true, NEWEST)));
        assertThat(allPages(Map.of("q", descriptionWord, "size", "50")))
                .containsExactlyElementsOf(ids(expected(r -> r.description().contains(descriptionWord), NEWEST)))
                .isNotEmpty();
        assertThat(allPages(Map.of("q", "  " + marker + "  ", "size", "50"))).hasSize(expected(r -> true, NEWEST).size());
    }

    @Test
    void wildcardsInASearchAreLiteral() throws Exception {
        // Unescaped, "a0_5" and "a0%5" would match names like "a005 mk...".
        assertThat(list(Map.of("q", "a0_5 " + marker)).get("total").asLong()).isZero();
        assertThat(list(Map.of("q", "a0%5 " + marker)).get("total").asLong()).isZero();
        assertThat(list(Map.of("q", "a005 " + marker)).get("total").asLong()).isPositive();
        // Its own word, not the marker: the seeded set stays as the other tests expect it.
        String own = "lit" + UUID.randomUUID().toString().substring(0, 8);
        long literal = jdbc.queryForObject("""
                INSERT INTO brackets (name, type, category, item_count) VALUES (?, 'image', 'General', 2) RETURNING id
                """, Long.class, "100%_sure\\ " + own);
        assertThat(ids(list(Map.of("q", "0%_sure\\ " + own)).get("items"))).containsExactly(literal);
    }

    @Test
    void categoriesFromBeforeTheFixedListCanStillBeFiltered() throws Exception {
        String own = "old" + UUID.randomUUID().toString().substring(0, 8);
        long legacy = jdbc.queryForObject("""
                INSERT INTO brackets (name, type, category, item_count) VALUES (?, 'image', 'Old stuff', 2) RETURNING id
                """, Long.class, "Legacy " + own);
        assertThat(ids(list(Map.of("q", own, "category", "Old stuff")).get("items"))).containsExactly(legacy);
        assertThat(list(Map.of("q", own, "category", "General")).get("total").asLong()).isZero();
    }

    @Test
    void badParametersAreFieldErrors() throws Exception {
        assertBadRequest(Map.of("sort", "random"), "sort");
        assertBadRequest(Map.of("sort", "name-desc"), "sort");
        assertBadRequest(Map.of("type", "gif"), "type");
        assertBadRequest(Map.of("page", "-1"), "page");
        assertBadRequest(Map.of("size", "0"), "size");
        assertBadRequest(Map.of("page", "1000", "size", "24"), "page");
        assertBadRequest(Map.of("q", "x".repeat(101)), "q");
        assertThat(perform(get("/brackets").param("page", "two")).getResponse().getStatus()).isEqualTo(400);
        assertThat(perform(as(OWNER_TOKEN, get("/me/brackets").param("sort", "random"))).getResponse().getStatus()).isEqualTo(400);
    }

    // ---- the caller's own brackets -----------------------------------------------------------

    @Test
    void myBracketsArePagedTooAndIncludeHiddenAndUnplayableOnes() throws Exception {
        List<Row> mine = sorted(rows.stream().filter(Row::owned).toList(), POPULAR);
        assertThat(mine).anyMatch(Row::hidden).anyMatch(r -> r.itemCount() < 2);

        List<Long> paged = new ArrayList<>();
        for (int page = 0; ; page++) {
            JsonNode body = body(perform(as(OWNER_TOKEN, get("/me/brackets")
                    .param("q", marker).param("sort", "popular").param("size", "7").param("page", Integer.toString(page)))));
            assertThat(body.get("total").asLong()).isEqualTo(mine.size());
            if (body.get("items").isEmpty()) break;
            paged.addAll(ids(body.get("items")));
        }
        assertThat(paged).containsExactlyElementsOf(ids(mine));
        // Nobody else's.
        assertThat(body(perform(as(USER_A, get("/me/brackets").param("q", marker)))).get("total").asLong()).isZero();
    }

    // ---- home ----------------------------------------------------------------------------------

    @Test
    void homeIsThreeSmallListsInTheirOwnOrders() throws Exception {
        JsonNode home = body(perform(get("/home")));

        JsonNode popular = home.get("popular");
        assertThat(popular).hasSizeBetween(1, 6);
        for (int i = 1; i < popular.size(); i++) {
            assertThat(popular.get(i).get("runCount").asLong()).isLessThanOrEqualTo(popular.get(i - 1).get("runCount").asLong());
        }
        assertThat(popular).allMatch(b -> b.get("runCount").asLong() > 0);

        assertThat(ids(home.get("recent"))).containsExactlyElementsOf(ids(list(Map.of("size", "6")).get("items")));

        JsonNode categories = home.get("categories");
        assertThat(categories.size()).isBetween(CATEGORIES.size(), 12);
        Set<String> seen = new HashSet<>();
        for (JsonNode section : categories) {
            String category = section.get("category").asString();
            assertThat(seen.add(category)).as(category).isTrue();
            List<Long> top = ids(list(Map.of("category", category, "sort", "popular", "size", "3")).get("items"));
            assertThat(ids(section.get("brackets"))).as(category).containsExactlyElementsOf(top);
        }
        // A category whose best bracket is played more comes first.
        for (int i = 1; i < categories.size(); i++) {
            long before = categories.get(i - 1).get("brackets").get(0).get("runCount").asLong();
            long after = categories.get(i).get("brackets").get(0).get("runCount").asLong();
            assertThat(after).isLessThanOrEqualTo(before);
        }
        // Seeded hidden and unplayable brackets are never on it.
        Set<Long> unlisted = new HashSet<>(ids(rows.stream().filter(r -> !r.listed()).toList()));
        assertThat(home.toString()).doesNotContain("\"hiddenAt\":\"");
        for (JsonNode b : home.findValues("id")) {
            assertThat(unlisted).doesNotContain(b.asLong());
        }
    }

    // ---- helpers -----------------------------------------------------------------------------

    private static final Comparator<Row> NEWEST =
            Comparator.comparing(Row::createdAt).thenComparingLong(Row::id).reversed();
    private static final Comparator<Row> POPULAR = Comparator.comparingLong(Row::runCount).reversed()
            .thenComparing(Comparator.comparing(Row::createdAt).reversed())
            .thenComparing(Comparator.comparingLong(Row::id).reversed());
    private static final Comparator<Row> NAME =
            Comparator.comparing((Row r) -> r.name().toLowerCase(Locale.ROOT)).thenComparingLong(Row::id);

    private List<Row> expected(Predicate<Row> filter, Comparator<Row> order) {
        return sorted(rows.stream().filter(Row::listed).filter(filter).toList(), order);
    }

    private static List<Row> sorted(List<Row> rows, Comparator<Row> order) {
        return rows.stream().sorted(order).toList();
    }

    private static List<Long> ids(List<Row> rows) {
        return rows.stream().map(Row::id).toList();
    }

    private static List<Long> ids(JsonNode items) {
        List<Long> ids = new ArrayList<>();
        items.forEach(b -> ids.add(b.get("id").asLong()));
        return ids;
    }

    private JsonNode list(Map<String, String> params) throws Exception {
        MvcResult result = perform(withParams(get("/brackets"), params));
        assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200);
        return body(result);
    }

    /** Follows the pages until one comes back empty, checking the total stays put. */
    private List<Long> allPages(Map<String, String> params) throws Exception {
        List<Long> ids = new ArrayList<>();
        Long total = null;
        for (int page = 0; page < 200; page++) {
            Map<String, String> withPage = new java.util.HashMap<>(params);
            withPage.put("page", Integer.toString(page));
            JsonNode body = list(withPage);
            if (total == null) total = body.get("total").asLong();
            assertThat(body.get("total").asLong()).isEqualTo(total);
            if (body.get("items").isEmpty()) break;
            ids.addAll(ids(body.get("items")));
        }
        assertThat(ids).hasSize(total.intValue());
        return ids;
    }

    private void assertBadRequest(Map<String, String> params, String field) throws Exception {
        MvcResult result = perform(withParams(get("/brackets"), params));
        assertThat(result.getResponse().getStatus()).as(params.toString()).isEqualTo(400);
        assertThat(body(result).get("errors").has(field)).as(params.toString()).isTrue();
    }

    private static MockHttpServletRequestBuilder withParams(MockHttpServletRequestBuilder request, Map<String, String> params) {
        params.forEach(request::param);
        return request;
    }
}
