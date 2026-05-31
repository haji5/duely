package com.bracketbattle.controller;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.net.URLEncoder;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/metadata")
public class MediaMetadataController {

    private final ObjectMapper mapper = new ObjectMapper();

    @GetMapping("/youtube/search")
    public ResponseEntity<Map<String, String>> searchYouTube(@RequestParam String query) {
        try {
            String encodedQuery = URLEncoder.encode(query, "UTF-8");
            Document doc = Jsoup.connect("https://www.youtube.com/results?search_query=" + encodedQuery)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    .get();

            String html = doc.html();
            Pattern pattern = Pattern.compile("\"videoId\":\"([a-zA-Z0-9_-]{11})\"");
            Matcher matcher = pattern.matcher(html);

            // Collect up to 5 unique candidate video IDs
            LinkedHashSet<String> candidateIds = new LinkedHashSet<>();
            while (matcher.find() && candidateIds.size() < 5) {
                candidateIds.add(matcher.group(1));
            }

            if (candidateIds.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            // Check each candidate for embeddability via YouTube's oEmbed endpoint.
            // oEmbed returns 200 for embeddable videos, 401 for restricted ones.
            for (String videoId : candidateIds) {
                if (isEmbeddable(videoId)) {
                    Map<String, String> result = new HashMap<>();
                    result.put("mediaUrl", "https://www.youtube.com/watch?v=" + videoId);
                    return ResponseEntity.ok(result);
                }
            }

            // Fallback: if oEmbed check fails for all (e.g. network issue), return the first result
            String fallbackId = candidateIds.iterator().next();
            Map<String, String> result = new HashMap<>();
            result.put("mediaUrl", "https://www.youtube.com/watch?v=" + fallbackId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Checks whether a YouTube video allows embedding by hitting the oEmbed endpoint.
     * Returns true if embeddable (HTTP 200), false if restricted (HTTP 401/other).
     */
    private boolean isEmbeddable(String videoId) {
        try {
            String oembedUrl = "https://www.youtube.com/oembed?url="
                    + URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, "UTF-8")
                    + "&format=json";
            int status = Jsoup.connect(oembedUrl)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    .ignoreContentType(true)
                    .ignoreHttpErrors(true)
                    .execute()
                    .statusCode();
            return status == 200;
        } catch (Exception e) {
            // If the check itself fails, assume embeddable to avoid blocking results
            return true;
        }
    }

    @GetMapping("/spotify/playlist")
    public ResponseEntity<List<Map<String, String>>> getSpotifyPlaylistTracks(@RequestParam String url) {
        try {
            // Very rudimentary validation
            if (!url.contains("spotify.com") || !url.contains("playlist")) {
                return ResponseEntity.badRequest().build();
            }

            // Convert to embed URL
            String embedUrl = url;
            if (!embedUrl.contains("/embed/")) {
                embedUrl = embedUrl.replace("spotify.com/playlist/", "spotify.com/embed/playlist/");
            }

            Document doc = Jsoup.connect(embedUrl).get();
            Element script = doc.getElementById("__NEXT_DATA__");
            if (script == null) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> data = mapper.readValue(script.html(), new TypeReference<Map<String, Object>>() {});
            Map<String, Object> props = (Map<String, Object>) data.get("props");
            Map<String, Object> pageProps = (Map<String, Object>) props.get("pageProps");
            Map<String, Object> state = (Map<String, Object>) pageProps.get("state");
            Map<String, Object> stateData = (Map<String, Object>) state.get("data");
            Map<String, Object> entity = (Map<String, Object>) stateData.get("entity");
            List<Map<String, Object>> trackList = (List<Map<String, Object>>) entity.get("trackList");

            List<Map<String, String>> result = new ArrayList<>();
            for (Map<String, Object> track : trackList) {
                String uri = (String) track.get("uri");
                if (uri != null && uri.startsWith("spotify:track:")) {
                    String id = uri.substring("spotify:track:".length());
                    String trackUrl = "https://open.spotify.com/track/" + id;
                    String title = (String) track.get("title");
                    String subtitle = (String) track.get("subtitle");

                    // Decode entities in subtitle and replace commas between artists with ampersands
                    if (subtitle != null && !subtitle.isEmpty()) {
                        subtitle = org.jsoup.parser.Parser.unescapeEntities(subtitle, false).replace("\u00A0", " ");
                        subtitle = subtitle.replace(",", " &");
                    }

                    String fullTitle = title + (subtitle != null && !subtitle.isEmpty() ? " - " + subtitle : "");

                    // Decode HTML entities in title
                    if (fullTitle != null) {
                       fullTitle = org.jsoup.parser.Parser.unescapeEntities(fullTitle, false).replace("\u00A0", " ");
                    }

                    Map<String, String> t = new HashMap<>();
                    t.put("title", fullTitle);
                    t.put("mediaUrl", trackUrl);
                    result.add(t);
                }
            }

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
}
