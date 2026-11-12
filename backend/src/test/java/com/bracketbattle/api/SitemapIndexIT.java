package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.parser.Parser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Past the per-file URL limit the sitemap becomes an index of parts. The limit is lowered to 103
 * URLs (three static pages and 50 brackets with up to two URLs each) so a few hundred brackets
 * are enough to need several parts.
 */
@TestPropertySource(properties = "app.sitemap.max-urls-per-file=103")
class SitemapIndexIT extends IntegrationTest {

    private static final String ORIGIN = "https://duely.example";

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void aLargeSitemapIsAnIndexOfPartsThatTogetherListEveryPublicBracket() throws Exception {
        long played = createBracket(USER_A, "Sitemap played", 2).get("id").asLong();
        perform(postJson("/brackets/" + played + "/results", runPayload(itemIds(played), null, null)));
        for (int i = 0; i < 120; i++) {
            jdbc.update("INSERT INTO brackets (name, type, category, item_count) VALUES (?, 'image', 'General', 2)", "Sitemap filler " + i);
        }
        long listed = jdbc.queryForObject("SELECT COUNT(*) FROM brackets WHERE hidden_at IS NULL AND item_count >= 2", Long.class);
        int parts = (int) Math.ceilDiv(listed, 50L);
        assertThat(parts).isGreaterThan(2);

        Document index = xml(get("/sitemap.xml"));
        assertThat(index.select("sitemapindex")).hasSize(1);
        List<String> partLocs = index.select("sitemap > loc").eachText();
        List<String> expectedLocs = new ArrayList<>();
        for (int n = 1; n <= parts; n++) expectedLocs.add(ORIGIN + "/sitemap-" + n + ".xml");
        assertThat(partLocs).containsExactlyElementsOf(expectedLocs);

        Set<String> brackets = new HashSet<>();
        Set<String> results = new HashSet<>();
        for (int n = 1; n <= parts; n++) {
            List<String> locs = xml(get("/sitemap-" + n + ".xml")).select("url > loc").eachText();
            assertThat(locs.size()).as("part " + n).isLessThanOrEqualTo(103);
            assertThat(locs.contains(ORIGIN + "/")).as("home in part " + n).isEqualTo(n == 1);
            for (String loc : locs) {
                if (loc.startsWith(ORIGIN + "/bracket/")) assertThat(brackets.add(loc)).as(loc).isTrue();
                if (loc.startsWith(ORIGIN + "/results/")) assertThat(results.add(loc)).as(loc).isTrue();
            }
        }
        Set<String> expectedBrackets = new HashSet<>();
        jdbc.queryForList("SELECT id FROM brackets WHERE hidden_at IS NULL AND item_count >= 2", Long.class)
                .forEach(id -> expectedBrackets.add(ORIGIN + "/bracket/" + id));
        assertThat(brackets).isEqualTo(expectedBrackets);
        Set<String> expectedResults = new HashSet<>();
        jdbc.queryForList("SELECT id FROM brackets WHERE hidden_at IS NULL AND item_count >= 2 AND last_run_at IS NOT NULL", Long.class)
                .forEach(id -> expectedResults.add(ORIGIN + "/results/" + id));
        assertThat(results).isEqualTo(expectedResults).contains(ORIGIN + "/results/" + played);

        for (String missing : List.of("/sitemap-0.xml", "/sitemap-" + (parts + 1) + ".xml", "/sitemap-x.xml")) {
            assertThat(perform(get(missing)).getResponse().getStatus()).as(missing).isEqualTo(404);
        }
    }

    private Document xml(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        MvcResult result = perform(request);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentType()).startsWith("application/xml");
        return Jsoup.parse(result.getResponse().getContentAsString(), "", Parser.xmlParser());
    }
}
