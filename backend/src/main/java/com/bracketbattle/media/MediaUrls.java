package com.bracketbattle.media;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Recognises the media links the frontend can embed. Mirrors frontend/src/utils/mediaUtils.ts. */
public final class MediaUrls {

    private static final Set<String> YOUTUBE_HOSTS = Set.of(
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
            "youtube-nocookie.com", "www.youtube-nocookie.com");
    private static final Set<String> YOUTUBE_PATH_PREFIXES = Set.of("shorts", "live", "embed", "v");
    private static final Pattern YOUTUBE_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final Pattern SPOTIFY_PATH = Pattern.compile(
            "^(?:/intl-[A-Za-z-]+)?(?:/embed)?/(track|album|playlist|episode|show|artist)/[A-Za-z0-9]{1,64}/?$");

    private MediaUrls() {}

    /** The 11-character video id of a YouTube watch, short, live, embed or youtu.be link, else null. */
    public static String youTubeVideoId(String url) {
        URI uri = parse(url);
        if (uri == null || uri.getHost() == null) return null;
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        String[] segments = path.replaceFirst("^/", "").split("/");
        String candidate = null;
        if (host.equals("youtu.be")) {
            candidate = segments[0];
        } else if (YOUTUBE_HOSTS.contains(host)) {
            if (path.equals("/watch") || path.equals("/watch/")) {
                candidate = queryParam(uri.getRawQuery(), "v");
            } else if (segments.length >= 2 && YOUTUBE_PATH_PREFIXES.contains(segments[0])) {
                candidate = segments[1];
            }
        }
        return candidate != null && YOUTUBE_ID.matcher(candidate).matches() ? candidate : null;
    }

    public static boolean isSpotifyHost(String host) {
        return host != null && host.equalsIgnoreCase("open.spotify.com");
    }

    public static boolean isSpotifyShortLinkHost(String host) {
        return host != null && (host.equalsIgnoreCase("spotify.link") || host.toLowerCase(Locale.ROOT).endsWith(".spotify.link"));
    }

    /** Whether an open.spotify.com path names an embeddable track, album, playlist, episode, show or artist. */
    public static boolean isEmbeddableSpotifyPath(String path) {
        return path != null && SPOTIFY_PATH.matcher(path).matches();
    }

    public static URI parse(String url) {
        if (url == null) return null;
        try {
            return new URI(url.trim());
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static String queryParam(String rawQuery, String name) {
        if (rawQuery == null) return null;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return pair.substring(eq + 1);
            }
        }
        return null;
    }
}
