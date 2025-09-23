package com.bracketbattle.util;

import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Set;

public final class Sanitizer {
    private static final Safelist BASIC = Safelist.none();
    private static final Set<String> ALLOWED_PROTOCOLS = Set.of("http","https");
    private static final Set<String> YOUTUBE_HOSTS = Set.of("www.youtube.com","youtube.com","youtu.be","www.youtube-nocookie.com");

    private Sanitizer() {}

    public static String stripToPlain(String input, int maxLen) {
        if (input == null) return null;
        String clean = Jsoup.clean(input, BASIC);
        if (clean.length() > maxLen) {
            return clean.substring(0, maxLen);
        }
        return clean;
    }

    public static String sanitizeDescription(String input, int maxLen) {
        if (input == null) return null;
        // Allow very restricted formatting if needed; using none to avoid XSS
        String clean = Jsoup.clean(input, Safelist.none());
        if (clean.length() > maxLen) return clean.substring(0, maxLen);
        return clean;
    }

    public static boolean isSafeHttpUrl(String url) {
        if (url == null || url.isBlank()) return false;
        try {
            URI uri = new URI(url);
            if (!ALLOWED_PROTOCOLS.contains(uri.getScheme())) return false;
            return true;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    public static boolean isYouTubeUrl(String url) {
        try {
            URI uri = new URI(url);
            if (!ALLOWED_PROTOCOLS.contains(uri.getScheme())) return false;
            String host = uri.getHost();
            return host != null && YOUTUBE_HOSTS.contains(host.toLowerCase());
        } catch (Exception e) {
            return false;
        }
    }
}

