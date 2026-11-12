package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.regex.MatchResult;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;

class PageIT extends IntegrationTest {

    @Test
    void bracketPageCarriesHeadTagsAndSummary() throws Exception {
        long id = createBracket(USER_A, "Page bracket", 4).get("id").asLong();

        MvcResult result = perform(get("/pages/bracket/" + id));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentType()).startsWith("text/html");
        Document page = Jsoup.parse(result.getResponse().getContentAsString());
        assertThat(page.select("meta[property=og:title]").attr("content")).isEqualTo("Page bracket");
        assertThat(page.select("link[rel=canonical]").attr("href")).isEqualTo("https://duely.example/bracket/" + id);
        assertThat(page.select("script[type=application/ld+json]")).hasSize(1);
        assertThat(page.select("#root li").eachText()).containsExactly("Item 0", "Item 1", "Item 2", "Item 3");
        // The page's own module script is still there, so the app boots.
        assertThat(page.select("script[type=module]")).hasSize(1);
        // Ownership never leaks into the page.
        assertThat(result.getResponse().getContentAsString()).doesNotContain("uid-a");
        // Link checkers use HEAD.
        assertThat(perform(head("/pages/bracket/" + id)).getResponse().getStatus()).isEqualTo(200);
        assertThat(perform(head("/sitemap.xml")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void resultsPageListsTheLeaderboard() throws Exception {
        long id = createBracket(USER_A, "Ranked bracket", 4).get("id").asLong();
        List<Long> items = itemIds(id);
        perform(postJson("/brackets/" + id + "/results", runPayload(List.of(items.get(2), items.get(0), items.get(1), items.get(3)), null, null)));

        Document page = Jsoup.parse(perform(get("/pages/results/" + id)).getResponse().getContentAsString());

        assertThat(page.select("meta[property=og:title]").attr("content")).isEqualTo("Ranked bracket results: everyone’s ranking");
        assertThat(page.select("#root li").first().text()).isEqualTo("Item 2: 100% of 2 matches won");
    }

    @Test
    void missingBracketIsA404ThatStillServesTheShell() throws Exception {
        for (String path : List.of("/pages/bracket/99999999", "/pages/results/99999999", "/pages/bracket/99999999999999999999999")) {
            MvcResult result = perform(get(path));

            assertThat(result.getResponse().getStatus()).as(path).isEqualTo(404);
            Document page = Jsoup.parse(result.getResponse().getContentAsString());
            assertThat(page.getElementById("root")).as(path).isNotNull();
            assertThat(page.select("meta[name=robots]").attr("content")).as(path).isEqualTo("noindex");
            assertThat(page.select("meta[property=og:url], script[type=application/ld+json]")).as(path).isEmpty();
        }
    }

    @Test
    void homeHasSiteJsonLd() throws Exception {
        MvcResult result = perform(get("/pages/home"));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        Document page = Jsoup.parse(result.getResponse().getContentAsString());
        JsonNode graph = json.readTree(page.select("script[type=application/ld+json]").first().data()).get("@graph");
        assertThat(graph.get(0).get("@type").asString()).isEqualTo("WebSite");
    }

    @Test
    void sitemapListsBracketsAndOnlyResultsWithRuns() throws Exception {
        long played = createBracket(USER_A, "Played", 4).get("id").asLong();
        long unplayed = createBracket(USER_A, "Unplayed", 2).get("id").asLong();
        List<Long> items = itemIds(played);
        perform(postJson("/brackets/" + played + "/results", runPayload(items, null, null)));

        MvcResult result = perform(get("/sitemap.xml"));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentType()).startsWith("application/xml");
        String xml = result.getResponse().getContentAsString();
        Document sitemap = Jsoup.parse(xml, "", org.jsoup.parser.Parser.xmlParser());
        List<String> locs = sitemap.select("loc").eachText();
        assertThat(locs).contains("https://duely.example/", "https://duely.example/browse", "https://duely.example/about",
                "https://duely.example/bracket/" + played, "https://duely.example/bracket/" + unplayed,
                "https://duely.example/results/" + played);
        assertThat(locs).doesNotContain("https://duely.example/results/" + unplayed);
        assertThat(xml).doesNotContain("localhost");
    }

    @Test
    void robotsTxtPointsAtTheSitemapOnTheConfiguredOrigin() throws Exception {
        MvcResult result = perform(get("/robots.txt"));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentType()).startsWith("text/plain");
        String robots = result.getResponse().getContentAsString();
        assertThat(robots).startsWith("User-agent: *\n").contains("Disallow: /create\n", "Disallow: /admin\n")
                .endsWith("Sitemap: https://duely.example/sitemap.xml\n");
        assertThat(perform(head("/robots.txt")).getResponse().getStatus()).isEqualTo(200);
    }

    /** What crawlers and unfurlers read names no origin but the configured one (and third-party media). */
    @Test
    void crawlerFacingResponsesUseOnlyTheConfiguredOrigin() throws Exception {
        long id = createBracket(USER_A, "Origin bracket", 4).get("id").asLong();
        perform(postJson("/brackets/" + id + "/results", runPayload(itemIds(id), null, null)));

        for (String path : List.of("/pages/home", "/pages/bracket/" + id, "/pages/results/" + id, "/pages/bracket/99999999",
                "/sitemap.xml", "/robots.txt")) {
            String body = perform(get(path)).getResponse().getContentAsString();
            List<String> origins = ORIGIN.matcher(body).results().map(MatchResult::group).distinct().toList();
            assertThat(origins).as(path).contains("https://duely.example")
                    .allMatch(o -> o.equals("https://duely.example") || THIRD_PARTY.contains(o));
        }
        Document home = Jsoup.parse(perform(get("/pages/home")).getResponse().getContentAsString());
        assertThat(home.select("meta[name=public-origin]").attr("content")).isEqualTo("https://duely.example");
    }

    private static final Pattern ORIGIN = Pattern.compile("https?://[^/\"'<>\\s]+");
    /** Origins the pages may link besides their own: schema.org vocabulary, the repository, entry media. */
    private static final List<String> THIRD_PARTY = List.of("https://schema.org", "https://github.com",
            "https://images.example.com", "https://i.ytimg.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com",
            "http://www.sitemaps.org");
}
