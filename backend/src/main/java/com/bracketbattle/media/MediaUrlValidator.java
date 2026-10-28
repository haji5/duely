package com.bracketbattle.media;

import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates media URLs before they are stored. Viewers' browsers load these URLs, so they must be
 * public https links (no LAN routers, cloud metadata hosts or localhost) and must match what the
 * frontend can actually play for the bracket type.
 */
@Component
public class MediaUrlValidator {

    public static final int MAX_LENGTH = 2000;

    private static final Set<String> BLOCKED_HOSTS = Set.of("localhost", "metadata", "metadata.google.internal");
    private static final Set<String> BLOCKED_SUFFIXES = Set.of(".localhost", ".local", ".internal");
    private static final Pattern NUMERIC_LABEL = Pattern.compile("^(?:0x[0-9a-f]*|[0-9]+)$");
    // Decimal octets without leading zeros: browsers read "012" as octal (10), Java as decimal (12).
    private static final Pattern DOTTED_QUAD = Pattern.compile("^(?:(?:0|[1-9]\\d{0,2})\\.){3}(?:0|[1-9]\\d{0,2})$");

    private final HostResolver resolver;

    public MediaUrlValidator(HostResolver resolver) {
        this.resolver = resolver;
    }

    /** Starts a validation pass. Each distinct host is looked up at most once per session. */
    public Session session() {
        return new Session();
    }

    public final class Session {
        private final Map<String, String> hostVerdicts = new HashMap<>();

        private Session() {}

        /** Returns null if the URL is acceptable for the given bracket type, else a reason. */
        public String check(String url, String type) {
            if (url == null || url.isBlank()) return "a media URL is required";
            String trimmed = url.trim();
            if (trimmed.length() > MAX_LENGTH) return "the media URL must be at most " + MAX_LENGTH + " characters";
            URI uri = MediaUrls.parse(trimmed);
            if (uri == null || uri.getScheme() == null || uri.getRawAuthority() == null) {
                return "the media URL is not a valid link";
            }
            if (!uri.getScheme().equalsIgnoreCase("https")) return "the media URL must start with https://";
            if (uri.getRawUserInfo() != null) return "the media URL must not contain a user name or password";
            if (uri.getHost() == null) return "the media URL is not a valid link";

            String host = normaliseHost(uri.getHost());
            String typeProblem = checkType(trimmed, uri, host, type);
            if (typeProblem != null) return typeProblem;
            String hostProblem = hostVerdicts.computeIfAbsent(host, MediaUrlValidator.this::checkHost);
            return hostProblem.isEmpty() ? null : hostProblem;
        }
    }

    private static String checkType(String url, URI uri, String host, String type) {
        switch (type) {
            case "video" -> {
                if (MediaUrls.youTubeVideoId(url) == null) {
                    return "video entries need a YouTube link (youtube.com/watch?v=…, youtu.be/…, /shorts/… or /live/…)";
                }
            }
            case "song" -> {
                if (MediaUrls.isSpotifyShortLinkHost(host)) {
                    return "Spotify short links (spotify.link) can't be embedded; open the link and copy the open.spotify.com address";
                }
                if (MediaUrls.isSpotifyHost(host) && !MediaUrls.isEmbeddableSpotifyPath(uri.getRawPath())) {
                    return "the Spotify link must point to a track, album, playlist, episode, show or artist";
                }
            }
            case "image" -> { /* any safe https URL */ }
            default -> { return "unknown bracket type"; }
        }
        return null;
    }

    /** Returns "" when the host is public, else the reason it is rejected. */
    private String checkHost(String host) {
        if (BLOCKED_HOSTS.contains(host) || BLOCKED_SUFFIXES.stream().anyMatch(host::endsWith)) {
            return "the media URL must not point to a local or internal host";
        }
        boolean ipv6Literal = host.contains(":");
        String lastLabel = host.substring(host.lastIndexOf('.') + 1);
        boolean numeric = !ipv6Literal && NUMERIC_LABEL.matcher(lastLabel).matches();
        if (numeric && !DOTTED_QUAD.matcher(host).matches()) {
            // Browsers read hosts like "2130706433" or "0x7f.1" as IP addresses; Java doesn't.
            return "the media URL has an invalid host";
        }
        try {
            InetAddress[] addresses = (ipv6Literal || numeric)
                    ? new InetAddress[]{InetAddress.getByName(host)} // literal: no DNS lookup
                    : resolver.resolve(host);
            if (addresses.length == 0) return "the media URL's host could not be found";
            for (InetAddress address : addresses) {
                if (!isPublic(address)) {
                    return "the media URL points to a private or reserved network address";
                }
            }
            return "";
        } catch (UnknownHostException e) {
            return "the media URL's host could not be found";
        }
    }

    private static String normaliseHost(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length() - 1);
        if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        return h;
    }

    /** True for globally routable unicast addresses only. */
    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return false;
        }
        byte[] b = address.getAddress();
        if (address instanceof Inet4Address) {
            int first = b[0] & 0xFF;
            int second = b[1] & 0xFF;
            if (first == 0) return false;                                   // 0.0.0.0/8
            if (first == 100 && second >= 64 && second <= 127) return false; // CGNAT 100.64.0.0/10
            if (first == 192 && second == 0 && (b[2] & 0xFF) == 0) return false; // 192.0.0.0/24
            if (first == 198 && (second == 18 || second == 19)) return false;    // benchmarking
            return first < 240;                                             // 240.0.0.0/4 and broadcast
        }
        if (address instanceof Inet6Address) {
            int first = b[0] & 0xFF;
            if ((first & 0xFE) == 0xFC) return false;                       // unique local fc00::/7
            boolean nat64 = first == 0x00 && (b[1] & 0xFF) == 0x64 && (b[2] & 0xFF) == 0xFF && (b[3] & 0xFF) == 0x9B;
            boolean ipv4Compatible = true;
            for (int i = 0; i < 12; i++) {
                if (b[i] != 0) { ipv4Compatible = false; break; }
            }
            if (nat64 || ipv4Compatible) {
                try {
                    byte[] v4 = {b[12], b[13], b[14], b[15]};
                    return isPublic(InetAddress.getByAddress(v4));
                } catch (UnknownHostException e) {
                    return false;
                }
            }
        }
        return true;
    }
}
