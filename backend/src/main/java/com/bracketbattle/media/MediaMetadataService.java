package com.bracketbattle.media;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.HttpStatusException;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Scrapes YouTube search and Spotify playlist embeds for the bracket creator. Results are cached
 * in Valkey so repeated imports don't hit the upstream sites again.
 */
@Service
public class MediaMetadataService {

    private static final Logger log = LoggerFactory.getLogger(MediaMetadataService.class);
    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    private static final int TIMEOUT_MS = 5000;
    private static final int MAX_CANDIDATES = 3;
    private static final Pattern VIDEO_ID = Pattern.compile("\"videoId\":\"([a-zA-Z0-9_-]{11})\"");

    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * The first embeddable video for a search, as a watch URL, or null if none of the top results
     * can be embedded.
     */
    @Cacheable(value = "youtubeSearch", key = "#query.strip().toLowerCase()", unless = "#result == null")
    public String findEmbeddableYouTubeUrl(String query) {
        String html;
        try {
            html = Jsoup.connect("https://www.youtube.com/results?search_query="
                            + URLEncoder.encode(query.strip(), StandardCharsets.UTF_8))
                    .userAgent(USER_AGENT)
                    .timeout(TIMEOUT_MS)
                    .execute()
                    .body();
        } catch (IOException e) {
            log.warn("YouTube search failed: {}", e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube search is unavailable right now");
        }

        Set<String> candidates = new LinkedHashSet<>();
        Matcher matcher = VIDEO_ID.matcher(html);
        while (matcher.find() && candidates.size() < MAX_CANDIDATES) {
            candidates.add(matcher.group(1));
        }
        for (String videoId : candidates) {
            if (isEmbeddable(videoId)) {
                return "https://www.youtube.com/watch?v=" + videoId;
            }
        }
        return null;
    }

    /**
     * Asks YouTube's oEmbed endpoint whether a video may be embedded (200 = yes, 401/403/404 = no).
     * If the check itself fails (network error), the video is assumed embeddable so a flaky
     * check doesn't block an import.
     */
    private boolean isEmbeddable(String videoId) {
        try {
            String url = "https://www.youtube.com/oembed?format=json&url="
                    + URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, StandardCharsets.UTF_8);
            int status = Jsoup.connect(url)
                    .userAgent(USER_AGENT)
                    .timeout(TIMEOUT_MS)
                    .ignoreContentType(true)
                    .ignoreHttpErrors(true)
                    .execute()
                    .statusCode();
            return status == 200;
        } catch (IOException e) {
            return true;
        }
    }

    /** Tracks of a public playlist as {title, mediaUrl} pairs, in playlist order. */
    @Cacheable(value = "spotifyPlaylist", key = "#playlistId")
    public List<Map<String, String>> getSpotifyPlaylistTracks(String playlistId) {
        Element script;
        try {
            script = Jsoup.connect("https://open.spotify.com/embed/playlist/" + playlistId)
                    .userAgent(USER_AGENT)
                    .timeout(TIMEOUT_MS)
                    .followRedirects(false)
                    .get()
                    .getElementById("__NEXT_DATA__");
        } catch (HttpStatusException e) {
            if (e.getStatusCode() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found (is it public?)");
            }
            log.warn("Spotify playlist fetch failed: {}", e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Spotify is unavailable right now");
        } catch (IOException e) {
            log.warn("Spotify playlist fetch failed: {}", e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Spotify is unavailable right now");
        }

        JsonNode trackList;
        try {
            trackList = script == null ? null
                    : mapper.readTree(script.html()).at("/props/pageProps/state/data/entity/trackList");
        } catch (IOException e) {
            trackList = null;
        }
        if (trackList == null || !trackList.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Spotify playlist format not recognised");
        }

        List<Map<String, String>> tracks = new ArrayList<>();
        for (JsonNode track : trackList) {
            String uri = track.path("uri").asText("");
            String title = decode(track.path("title").asText(""));
            if (!uri.startsWith("spotify:track:") || title.isBlank()) {
                continue;
            }
            String artists = decode(track.path("subtitle").asText(""));
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
