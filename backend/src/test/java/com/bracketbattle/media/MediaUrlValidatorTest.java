package com.bracketbattle.media;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MediaUrlValidatorTest {

    private final List<String> lookups = new ArrayList<>();
    private final MediaUrlValidator validator = new MediaUrlValidator(host -> {
        lookups.add(host);
        return switch (host) {
            case "lan.example" -> new InetAddress[]{InetAddress.getByName("192.168.1.10")};
            case "mixed.example" -> new InetAddress[]{InetAddress.getByName("93.184.216.34"), InetAddress.getByName("10.1.2.3")};
            case "nowhere.example" -> throw new UnknownHostException(host);
            default -> new InetAddress[]{InetAddress.getByName("93.184.216.34")};
        };
    });

    private String check(String url, String type) {
        return validator.session().check(url, type);
    }

    @Test
    void acceptsPublicHttpsImages() {
        assertThat(check("https://images.example.com/cat.png", "image")).isNull();
        assertThat(check("HTTPS://images.example.com/cat.png", "image")).isNull();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "http://images.example.com/cat.png | https://",
            "ftp://images.example.com/cat.png | https://",
            "javascript:alert(1) | not a valid link",
            "https://user:pw@images.example.com/cat.png | user name or password",
            "https://images.example.com/a cat.png | not a valid link",
            "not a url | not a valid link"
    })
    void rejectsBadSchemesAndShapes(String url, String reason) {
        assertThat(check(url, "image")).contains(reason);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://localhost/x.png", "https://foo.localhost/x.png", "https://printer.local/x.png",
            "https://metadata.google.internal/x", "https://127.0.0.1/x.png", "https://127.8.9.10/x.png",
            "https://10.0.0.1/x.png", "https://172.16.5.4/x.png", "https://192.168.0.1/x.png",
            "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/x.png", "https://100.100.100.200/x",
            "https://0.0.0.0/x.png", "https://224.0.0.1/x.png", "https://255.255.255.255/x.png",
            "https://[::1]/x.png", "https://[fe80::1]/x.png", "https://[fd00:ec2::254]/x.png",
            "https://[::ffff:10.0.0.1]/x.png", "https://[64:ff9b::a00:1]/x.png", "https://[ff02::1]/x.png",
            "https://2130706433/x.png", "https://0x7f.1/x.png",
            "https://lan.example/x.png", "https://mixed.example/x.png"
    })
    void rejectsLocalPrivateAndReservedHosts(String url) {
        assertThat(check(url, "image")).isNotNull();
    }

    @Test
    void acceptsPublicIpLiterals() {
        assertThat(check("https://93.184.216.34/x.png", "image")).isNull();
        assertThat(check("https://[2606:2800:220:1:248:1893:25c8:1946]/x.png", "image")).isNull();
    }

    @Test
    void unresolvableHostsAreRejected() {
        assertThat(check("https://nowhere.example/x.png", "image")).contains("could not be found");
    }

    @Test
    void resolvesEachHostOncePerSession() {
        MediaUrlValidator.Session session = validator.session();
        for (int i = 0; i < 500; i++) {
            assertThat(session.check("https://www.youtube.com/watch?v=abcdefghij" + (i % 10), "video")).isNull();
        }
        assertThat(lookups).containsExactly("www.youtube.com");
    }

    @Test
    void literalAddressesSkipDns() {
        check("https://93.184.216.34/x.png", "image");
        assertThat(lookups).isEmpty();
    }

    @Test
    void videosMustBeYouTube() {
        assertThat(check("https://youtu.be/dQw4w9WgXcQ", "video")).isNull();
        assertThat(check("https://vimeo.com/123", "video")).contains("YouTube");
        assertThat(check("https://www.youtube.com/watch?v=short", "video")).contains("YouTube");
        assertThat(check("https://www.youtube.com/channel/UC123", "video")).contains("YouTube");
    }

    @Test
    void songsAcceptSpotifyAndAudioUrlsButNotShortLinks() {
        assertThat(check("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "song")).isNull();
        assertThat(check("https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x", "song")).isNull();
        assertThat(check("https://cdn.example.com/song.mp3", "song")).isNull();
        assertThat(check("https://spotify.link/abc123", "song")).contains("spotify.link");
        assertThat(check("https://open.spotify.com/user/someone", "song")).contains("Spotify link");
    }

    @Test
    void lengthIsLimited() {
        assertThat(check("https://images.example.com/" + "a".repeat(2000), "image")).contains("2000");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ | dQw4w9WgXcQ",
            "https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42 | dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ | dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD | dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=abc | dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ | dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share | dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ | dQw4w9WgXcQ",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ | dQw4w9WgXcQ",
            "HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ | dQw4w9WgXcQ"
    })
    void extractsYouTubeIds(String url, String id) {
        assertThat(MediaUrls.youTubeVideoId(url)).isEqualTo(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://www.youtube.com/watch?v=tooShort", "https://www.youtube.com/watch?v=waytoolongid123",
            "https://evil.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/playlist?list=PL123",
            "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"
    })
    void rejectsNonVideoYouTubeLinks(String url) {
        assertThat(MediaUrls.youTubeVideoId(url)).isNull();
    }

    @Test
    void publicAddressClassification() throws Exception {
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("8.8.8.8"))).isTrue();
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("100.63.255.255"))).isTrue();
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("100.128.0.0"))).isTrue();
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("100.127.255.255"))).isFalse();
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("172.32.0.1"))).isTrue();
        assertThat(MediaUrlValidator.isPublic(InetAddress.getByName("240.0.0.1"))).isFalse();
    }
}
