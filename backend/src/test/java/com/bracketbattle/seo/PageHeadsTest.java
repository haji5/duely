package com.bracketbattle.seo;

import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.BracketDto;
import com.bracketbattle.dto.ItemDto;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PageHeadsTest {

    private static final String HOSTILE = "</script><b>\"x\"";

    private final PageHeads heads = new PageHeads("https://duely.example/", true);

    @Test
    void hostileBracketTextComesOutInert() throws IOException {
        BracketDto bracket = bracket(HOSTILE, "Desc </title><img src=x onerror=alert(1)>");
        List<ItemDto> items = List.of(item(1, HOSTILE + " entry", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
                item(2, "Plain", "https://images.example.com/a.png"));

        String html = heads.bracket(shell(), bracket, items).outerHtml();

        // No markup made it through: the only <b>, <img> and </title> are escaped text.
        assertThat(html).doesNotContain("<b>", "<img", "</script><b>");
        assertThat(html).contains("&lt;/script&gt;&lt;b&gt;");
        // Re-parsing finds exactly the elements we put there, with the user text intact.
        Document parsed = Jsoup.parse(html);
        assertThat(parsed.select("b, img")).isEmpty();
        assertThat(parsed.title()).startsWith(HOSTILE);
        assertThat(parsed.select("meta[property=og:title]").attr("content")).isEqualTo(HOSTILE);
        assertThat(parsed.select("#root h1").text()).isEqualTo(HOSTILE);
        assertThat(parsed.select("#root li").first().text()).isEqualTo(HOSTILE + " entry");
        JsonNode ld = jsonLd(parsed);
        assertThat(ld.get("@graph").get(0).get("name").asString()).isEqualTo(HOSTILE);
        assertThat(parsed.select("script[type=application/ld+json]").first().data()).doesNotContain("<", ">");
    }

    @Test
    void bracketPageHasHeadTagsJsonLdAndSummary() throws IOException {
        Document page = heads.bracket(shell(), bracket("Best songs", ""),
                List.of(item(1, "First", "https://youtu.be/dQw4w9WgXcQ"), item(2, "Second", "https://youtu.be/aaaaaaaaaaa")));

        assertThat(page.title()).isEqualTo("Best songs — 2-entry song bracket | Duely");
        assertThat(page.select("title")).hasSize(1);
        assertThat(page.select("meta[name=description]")).hasSize(1);
        assertThat(page.select("meta[name=description]").attr("content"))
                .isEqualTo("Play Best songs, a 2-entry song bracket in Music. Pick a favourite of two each match until one is left standing.");
        assertThat(page.select("link[rel=canonical]").attr("href")).isEqualTo("https://duely.example/bracket/7");
        assertThat(page.select("meta[property=og:url]").attr("content")).isEqualTo("https://duely.example/bracket/7");
        assertThat(page.select("meta[property=og:image]").attr("content")).isEqualTo("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
        assertThat(page.select("meta[property=og:image:width]").attr("content")).isEqualTo("480");
        assertThat(page.select("meta[name=twitter:card]").attr("content")).isEqualTo("summary_large_image");

        JsonNode graph = jsonLd(page).get("@graph");
        assertThat(graph.get(0).has("description")).isFalse(); // blank descriptions are left out
        assertThat(graph.get(1).get("@type").asString()).isEqualTo("ItemList");
        assertThat(graph.get(1).get("numberOfItems").asInt()).isEqualTo(2);
        assertThat(graph.get(1).get("itemListElement").get(1).get("item").get("name").asString()).isEqualTo("Second");
        assertThat(graph.get(2).get("itemListElement").get(2).has("item")).isFalse();

        assertThat(page.select("#root li").eachText()).containsExactly("First", "Second");
        assertThat(page.select("#root a").attr("href")).isEqualTo("/results/7");
    }

    @Test
    void resultsPageListsTopTenWithThePageWording() throws IOException {
        List<ItemDto> items = new java.util.ArrayList<>();
        List<ItemRankingDto> rankings = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) {
            ItemDto item = item(i + 1, "Entry " + i, "https://images.example.com/" + i + ".png");
            items.add(item);
            rankings.add(new ItemRankingDto(item, 12 - i, i == 0 ? 1 : 20, 95 - i, 0.9, 1.0, 5));
        }

        Document page = heads.results(shell(), bracket("Best", "x"), items, rankings);

        assertThat(page.select("#root li")).hasSize(10);
        assertThat(page.select("#root li").first().text()).isEqualTo("Entry 0: 95% of 1 match won");
        assertThat(page.select("#root li").get(1).text()).isEqualTo("Entry 1: 94% of 20 matches won");
        assertThat(page.select("meta[property=og:image]").attr("content")).isEqualTo("https://duely.example/og.png");
        assertThat(page.select("meta[name=description]").attr("content")).contains("In the lead: Entry 0.");
        JsonNode ranking = jsonLd(page).get("@graph").get(1);
        assertThat(ranking.get("numberOfItems").asInt()).isEqualTo(12);
        assertThat(ranking.get("itemListElement").get(0).get("description").asString()).isEqualTo("95% of 1 match won");
    }

    @Test
    void homeHasWebsiteSearchActionAppAndOrganization() throws IOException {
        Document page = heads.home(shell());

        JsonNode graph = jsonLd(page).get("@graph");
        assertThat(graph.get(0).get("potentialAction").get("target").get("urlTemplate").asString())
                .isEqualTo("https://duely.example/browse?q={search_term_string}");
        assertThat(graph.get(1).get("@type").asString()).isEqualTo("WebApplication");
        assertThat(graph.get(2).get("sameAs").get(0).asString()).isEqualTo("https://github.com/haji5/duely");
        assertThat(page.select("link[rel=canonical]").attr("href")).isEqualTo("https://duely.example/");
        assertThat(page.select("#root").first().childrenSize()).isZero();
    }

    @Test
    void titlesAreShortenedLikeTheFrontend() {
        String longName = "A".repeat(80);
        String title = PageHeads.pageTitle(longName, " results: everyone’s ranking", " results");
        assertThat(title).hasSize(PageHeads.MAX_TITLE).endsWith("… results | Duely");
        assertThat(PageHeads.truncate("short", 10)).isEqualTo("short");
    }

    @Test
    void rejectsARelativeBaseUrl() {
        assertThatThrownBy(() -> new PageHeads("duely.example", false)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aPublicOriginMustBeHttpsOnAHostOthersCanReach() {
        for (String origin : List.of("http://duely.example", "https://localhost", "https://localhost:3000",
                "https://app.localhost", "https://LOCALHOST.", "https://127.0.0.1", "https://127.1.2.3:8443",
                "https://0.0.0.0", "https://[::1]", "https://[::]", "https://[::ffff:127.0.0.1]", "https://10.0.0.5",
                "https://192.168.1.20:3000", "https://172.29.53.1", "https://169.254.1.1", "https://[fd00::1]",
                "https://[fe80::1]")) {
            assertThatThrownBy(() -> new PageHeads(origin, true)).as(origin)
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("PUBLIC_BASE_URL");
        }
        for (String origin : List.of("https://duely.example", "https://example.test/", "https://play.duely.example:8443",
                "https://203.0.113.7", "https://[2001:db8::1]")) {
            assertThat(new PageHeads(origin, true).origin()).as(origin).isEqualTo(origin.replaceAll("/$", ""));
        }
        // Development keeps working on localhost.
        assertThat(new PageHeads("http://localhost:3000", false).origin()).isEqualTo("http://localhost:3000");
    }

    @Test
    void everyPageHandsTheOriginToTheApp() throws IOException {
        BracketDto bracket = bracket("Best songs", "");
        List<ItemDto> items = List.of(item(1, "First", "https://youtu.be/dQw4w9WgXcQ"), item(2, "Second", "https://youtu.be/aaaaaaaaaaa"));
        for (Document page : List.of(heads.home(shell()), heads.bracket(shell(), bracket, items),
                heads.results(shell(), bracket, items, List.of()), heads.notFound(shell()))) {
            assertThat(page.select("meta[name=public-origin]")).hasSize(1);
            assertThat(page.select("meta[name=public-origin]").attr("content")).isEqualTo("https://duely.example");
        }
    }

    // ---- helpers ---------------------------------------------------------------------------

    static Document shell() throws IOException {
        try (InputStream in = PageHeadsTest.class.getResourceAsStream("/spa-shell-fixture.html")) {
            Document document = Jsoup.parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            document.outputSettings().prettyPrint(false);
            return document;
        }
    }

    private static JsonNode jsonLd(Document page) {
        return JsonMapper.builder().build().readTree(page.select("script[type=application/ld+json]").first().data());
    }

    private static BracketDto bracket(String name, String description) {
        return new BracketDto(7L, name, description, "video", "Music", Instant.parse("2026-06-18T10:00:00Z"), null, 0, 0);
    }

    private static ItemDto item(long id, String title, String url) {
        return new ItemDto(id, 7L, title, url, "video");
    }
}
