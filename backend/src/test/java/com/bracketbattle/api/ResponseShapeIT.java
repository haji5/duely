package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * The API sends exactly the fields of its view classes, never an entity's: a column added to an
 * entity stays private until a view class names it. Fresh and cached responses alike.
 */
class ResponseShapeIT extends IntegrationTest {

    private static final Set<String> BRACKET = Set.of(
            "id", "name", "description", "type", "category", "createdAt", "hiddenAt", "itemCount", "runCount");
    private static final Set<String> ITEM = Set.of("id", "bracketId", "title", "mediaUrl", "mediaType");
    private static final Set<String> RESULT = Set.of(
            "id", "bracketId", "ranking", "places", "matches", "createdAt", "displayName", "comment");

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void responsesCarryOnlyTheViewFields() throws Exception {
        JsonNode created = createBracket(USER_A, "Shapes", 4);
        assertThat(fields(created)).isEqualTo(BRACKET);
        long id = created.get("id").asLong();

        for (int i = 0; i < 2; i++) { // the second round is served from the cache
            assertThat(fields(body(perform(get("/brackets/" + id))))).isEqualTo(BRACKET);
            JsonNode items = body(perform(get("/brackets/" + id + "/items")));
            assertThat(items).hasSize(4).allSatisfy(item -> assertThat(fields(item)).isEqualTo(ITEM));
            JsonNode page = body(perform(get("/brackets")));
            assertThat(page.get("items")).isNotEmpty().allSatisfy(b -> assertThat(fields(b)).isEqualTo(BRACKET));
            JsonNode home = body(perform(get("/home")));
            assertThat(home.get("recent")).isNotEmpty().allSatisfy(b -> assertThat(fields(b)).isEqualTo(BRACKET));
        }

        List<Long> ranking = itemIds(id);
        JsonNode saved = body(perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, null, "hi")))));
        assertThat(fields(saved)).isEqualTo(RESULT);
        for (int i = 0; i < 2; i++) {
            JsonNode mine = body(perform(as(USER_A, get("/me/results").param("bracketId", String.valueOf(id)))));
            assertThat(mine).hasSize(1).allSatisfy(r -> assertThat(fields(r)).isEqualTo(RESULT));
            assertThat(mine.get(0).get("places")).hasSize(4);
            JsonNode rankings = body(perform(get("/brackets/" + id + "/rankings")));
            assertThat(rankings).hasSize(4).allSatisfy(row -> assertThat(fields(row.get("item"))).isEqualTo(ITEM));
        }
    }

    @Test
    void schemaDropsLeftoversAndChecksTypes() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns"
                + " WHERE table_name = 'results' AND column_name = 'version'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_user_bracket_token'",
                Long.class)).isZero();
        // Validated, since no row broke them.
        assertThat(jdbc.queryForList("SELECT conname FROM pg_constraint WHERE convalidated"
                + " AND conname IN ('ck_brackets_type', 'ck_items_media_type')", String.class))
                .containsExactlyInAnyOrder("ck_brackets_type", "ck_items_media_type");

        assertThatThrownBy(() -> jdbc.update("INSERT INTO brackets (name, type, category) VALUES ('x', 'banana', 'General')"))
                .isInstanceOf(DataIntegrityViolationException.class);
        long id = createBracketId();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO items (bracket_id, title, media_url, media_type)"
                + " VALUES (?, 'x', 'https://images.example.com/x.png', 'gif')", id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private long createBracketId() {
        try {
            return createBracket(USER_B, "Typed", 2).get("id").asLong();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Set<String> fields(JsonNode node) {
        return new HashSet<>(node.propertyNames());
    }
}
