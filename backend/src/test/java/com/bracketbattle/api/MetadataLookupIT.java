package com.bracketbattle.api;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** The bracket creator's lookups against fake YouTube and Spotify pages (FakeUpstreamHttp). */
class MetadataLookupIT extends IntegrationTest {

    private static final String SEARCH = "youtube.com/results";
    private static final String OEMBED = "youtube.com/oembed";

    @Test
    void aMatchIsTheFirstEmbeddableResultAndIsCached() throws Exception {
        upstream.reply(SEARCH, 200, results("aaaaaaaaaaa", "bbbbbbbbbbb"));
        upstream.reply("aaaaaaaaaaa", 401, "");
        upstream.reply("bbbbbbbbbbb", 200, "{}");

        MvcResult found = search("Some Song");
        assertThat(found.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(found).get("mediaUrl").asString()).isEqualTo("https://www.youtube.com/watch?v=bbbbbbbbbbb");

        int requests = upstream.requests().size();
        assertThat(body(search("  some song ")).get("mediaUrl").asString()).endsWith("bbbbbbbbbbb");
        assertThat(upstream.requests()).hasSize(requests);
    }

    @Test
    void noMatchIsA404CachedForAnHour() throws Exception {
        upstream.reply(SEARCH, 200, results("aaaaaaaaaaa", "bbbbbbbbbbb"));
        upstream.reply(OEMBED, 403, "");

        assertThat(search("Unembeddable").getResponse().getStatus()).isEqualTo(404);
        int requests = upstream.requests().size();
        assertThat(search("unembeddable").getResponse().getStatus()).isEqualTo(404);
        assertThat(upstream.requests()).hasSize(requests);
        Long ttl = redis.getExpire("duely:v8:youtubeNoMatch::unembeddable");
        assertThat(ttl).isBetween(3500L, 3600L);
    }

    @Test
    void aFailedEmbedCheckIsNeverOfferedAndNotCachedAsNoMatch() throws Exception {
        upstream.reply(SEARCH, 200, results("aaaaaaaaaaa"));
        upstream.unreachable(OEMBED);

        MvcResult failed = search("Flaky");
        assertThat(failed.getResponse().getStatus()).isEqualTo(502);
        assertThat(redis.hasKey("duely:v8:youtubeNoMatch::flaky")).isFalse();

        // Once the check works again, the same search is asked again and finds the video.
        upstream.reply(OEMBED, 200, "{}");
        assertThat(body(search("Flaky")).get("mediaUrl").asString()).endsWith("aaaaaaaaaaa");

        // A failed check on one candidate doesn't stop a later one from matching.
        upstream.reset();
        upstream.reply(SEARCH, 200, results("ccccccccccc", "ddddddddddd"));
        upstream.unreachable("ccccccccccc");
        upstream.reply("ddddddddddd", 200, "{}");
        assertThat(body(search("Second")).get("mediaUrl").asString()).endsWith("ddddddddddd");
    }

    @Test
    void spotifyFailuresAreCountedAndAMissingPlaylistIsNot() throws Exception {
        upstream.reply("embed/playlist/gone", 404, "");
        upstream.reply("embed/playlist/changed", 200, "<html><body>new markup</body></html>");
        upstream.reply("embed/playlist/good", 200, playlist());

        MvcResult missing = perform(as(USER_A, get("/metadata/spotify/playlist").param("url", "https://open.spotify.com/playlist/gone")));
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);

        MvcResult changed = perform(as(USER_A, get("/metadata/spotify/playlist").param("url", "https://open.spotify.com/playlist/changed")));
        assertThat(changed.getResponse().getStatus()).isEqualTo(502);
        assertThat(body(changed).get("message").asString()).isEqualTo("Spotify: playlist format not recognised");

        MvcResult good = perform(as(USER_A, get("/metadata/spotify/playlist").param("url", "https://open.spotify.com/playlist/good")));
        assertThat(body(good)).hasSize(1);
        assertThat(body(good).get(0).get("title").asString()).isEqualTo("Song One - Artist");

        String metrics = perform(get("/actuator/prometheus")).getResponse().getContentAsString();
        assertThat(metrics).containsPattern("duely_scrape_failures_total\\{upstream=\"spotify\"[^}]*} [1-9]");
    }

    private MvcResult search(String query) throws Exception {
        return perform(as(USER_A, get("/metadata/youtube/search").param("query", query)));
    }

    private static String results(String... videoIds) {
        StringBuilder html = new StringBuilder("<html><script>var ytInitialData = {");
        for (String id : videoIds) {
            html.append("\"videoRenderer\":{\"videoId\":\"").append(id).append("\"},");
        }
        return html.append("};</script></html>").toString();
    }

    private static String playlist() {
        return """
                <html><body><script id="__NEXT_DATA__" type="application/json">
                {"props":{"pageProps":{"state":{"data":{"entity":{"trackList":[
                  {"uri":"spotify:track:4uLU6hMCjMI75M1A2tKUQC","title":"Song&nbsp;One","subtitle":"Artist"},
                  {"uri":"spotify:episode:x","title":"Not a track","subtitle":""}
                ]}}}}}}
                </script></body></html>""";
    }
}
