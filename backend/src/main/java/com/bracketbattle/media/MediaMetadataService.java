package com.bracketbattle.media;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Scrapes YouTube search and Spotify playlist embeds for the bracket creator. This depends on
 * those pages' markup, which they can change at any time; when they do, lookups fail with a 502
 * (counted, see UpstreamGuard) until the parsing here is updated. Every request goes through
 * {@link UpstreamGuard}. Results are cached in Valkey, and so is "no match" (for an hour), so
 * repeated imports don't hit the upstream sites again.
 */
@Service
public class MediaMetadataService {

    private static final Duration SEARCH_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration OEMBED_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration PLAYLIST_TIMEOUT = Duration.ofSeconds(5);
    private static final int MAX_CANDIDATES = 3;
    private static final Pattern VIDEO_ID = Pattern.compile("\"videoId\":\"([a-zA-Z0-9_-]{11})\"");

    /** What {@link #findEmbeddableYouTubeUrl} returns when none of the top results can be embedded. */
    public static final String NO_MATCH = "";

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final UpstreamHttp http;
    private final UpstreamGuard guard;

    public MediaMetadataService(UpstreamHttp http, UpstreamGuard guard) {
        this.http = http;
        this.guard = guard;
    }

    /**
     * The first embeddable video for a search, as a watch URL, or {@link #NO_MATCH}. A match is
     * cached for a day, no match for an hour; failures aren't cached.
     */
    @Caching(cacheable = {
            @Cacheable(value = "youtubeSearch", key = "#query.strip().toLowerCase()", unless = "#result.isEmpty()"),
            @Cacheable(value = "youtubeNoMatch", key = "#query.strip().toLowerCase()", unless = "!#result.isEmpty()")
    })
    public String findEmbeddableYouTubeUrl(String query) {
        return guard.call(UpstreamGuard.Upstream.YOUTUBE, () -> {
            UpstreamHttp.Response page = http.get("https://www.youtube.com/results?search_query="
                    + URLEncoder.encode(query.strip(), StandardCharsets.UTF_8), SEARCH_TIMEOUT, true);
            if (!page.ok()) {
                throw new UpstreamGuard.Failure("search answered " + page.status());
            }
            Set<String> candidates = new LinkedHashSet<>();
            Matcher matcher = VIDEO_ID.matcher(page.body());
            while (matcher.find() && candidates.size() < MAX_CANDIDATES) {
                candidates.add(matcher.group(1));
            }
            boolean checkFailed = false;
            for (String videoId : candidates) {
                Embeddable verdict = embeddable(videoId);
                if (verdict == Embeddable.YES) {
                    return "https://www.youtube.com/watch?v=" + videoId;
                }
                checkFailed |= verdict == Embeddable.UNKNOWN;
            }
            // A video whose check failed is never offered. But then "no match" isn't known either,
            // and caching it would hide the right answer for an hour.
            if (checkFailed) {
                throw new UpstreamGuard.Failure("couldn't check whether the videos found can be embedded");
            }
            return NO_MATCH;
        });
    }

    private enum Embeddable { YES, NO, UNKNOWN }

    /** YouTube's oEmbed endpoint answers 200 for embeddable videos and 401/403/404 for the rest. */
    private Embeddable embeddable(String videoId) {
        String url = "https://www.youtube.com/oembed?format=json&url="
                + URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, StandardCharsets.UTF_8);
        try {
            int status = http.get(url, OEMBED_TIMEOUT, false).status();
            if (status == 200) return Embeddable.YES;
            return status == 401 || status == 403 || status == 404 ? Embeddable.NO : Embeddable.UNKNOWN;
        } catch (IOException e) {
            return Embeddable.UNKNOWN;
        }
    }

    /** Tracks of a public playlist as {title, mediaUrl} pairs, in playlist order. */
    @Cacheable(value = "spotifyPlaylist", key = "#playlistId")
    public List<Map<String, String>> getSpotifyPlaylistTracks(String playlistId) {
        List<Map<String, String>> tracks = guard.call(UpstreamGuard.Upstream.SPOTIFY, () -> {
            UpstreamHttp.Response page = http.get("https://open.spotify.com/embed/playlist/" + playlistId, PLAYLIST_TIMEOUT, false);
            if (page.status() == 404) {
                return null; // the upstream is fine; the playlist isn't public, or doesn't exist
            }
            if (!page.ok()) {
                throw new UpstreamGuard.Failure("the playlist page answered " + page.status());
            }
            return parseTracks(page.body());
        });
        if (tracks == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found (is it public?)");
        }
        return tracks;
    }

    private List<Map<String, String>> parseTracks(String html) throws UpstreamGuard.Failure {
        Element script = Jsoup.parse(html).getElementById("__NEXT_DATA__");
        JsonNode trackList;
        try {
            trackList = script == null ? null
                    : mapper.readTree(script.html()).at("/props/pageProps/state/data/entity/trackList");
        } catch (JacksonException e) {
            trackList = null;
        }
        if (trackList == null || !trackList.isArray()) {
            throw new UpstreamGuard.Failure("playlist format not recognised");
        }

        List<Map<String, String>> tracks = new ArrayList<>();
        for (JsonNode track : trackList) {
            String uri = track.path("uri").asString("");
            String title = decode(track.path("title").asString(""));
            if (!uri.startsWith("spotify:track:") || title.isBlank()) {
                continue;
            }
            String artists = decode(track.path("subtitle").asString(""));
            Map<String, String> entry = new HashMap<>();
            entry.put("title", artists.isBlank() ? title : title + " - " + artists);
            entry.put("mediaUrl", "https://open.spotify.com/track/" + uri.substring("spotify:track:".length()));
            tracks.add(entry);
        }
        return tracks;
    }

    private static String decode(String s) {
        return Parser.unescapeEntities(s, false).replace(' ', ' ').strip();
    }

    /**
     * Extracts the playlist id from an open.spotify.com playlist URL (optionally /embed and an
     * intl-xx segment). Returns null for anything else, so user input never chooses the host.
     */
    public static String extractSpotifyPlaylistId(String url) {
        if (url == null || url.length() > 500) return null;
        java.net.URI uri = MediaUrls.parse(url);
        if (uri == null || uri.getScheme() == null) return null;
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) return null;
        if (!MediaUrls.isSpotifyHost(uri.getHost())) return null;
        if (uri.getPort() != -1 || uri.getUserInfo() != null || uri.getPath() == null) return null;
        Matcher m = SPOTIFY_PLAYLIST_PATH.matcher(uri.getPath());
        return m.matches() ? m.group(1) : null;
    }

    private static final Pattern SPOTIFY_PLAYLIST_PATH =
            Pattern.compile("^(?:/intl-[a-zA-Z-]+)?(?:/embed)?/playlist/([a-zA-Z0-9]{1,64})/?$");
}
