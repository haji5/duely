package com.bracketbattle.media;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class SpotifyPlaylistIdTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M | 37i9dQZF1DXcBWIGoYBM5M",
            "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc | 37i9dQZF1DXcBWIGoYBM5M",
            "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M/ | 37i9dQZF1DXcBWIGoYBM5M",
            "https://open.spotify.com/embed/playlist/abc123 | abc123",
            "https://open.spotify.com/intl-de/playlist/abc123 | abc123",
            "http://open.spotify.com/playlist/abc123 | abc123",
            "https://OPEN.SPOTIFY.COM/playlist/abc123 | abc123",
    })
    void extractsPlaylistIds(String url, String id) {
        assertThat(MediaMetadataService.extractSpotifyPlaylistId(url)).isEqualTo(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://open.spotify.com/track/abc123", "https://open.spotify.com/playlist/",
            "https://open.spotify.com/playlist/abc/def", "https://open.spotify.com:8443/playlist/abc",
            "https://user@open.spotify.com/playlist/abc", "https://open.spotify.com.evil.com/playlist/abc",
            "https://evil.com/open.spotify.com/playlist/abc", "ftp://open.spotify.com/playlist/abc",
            "https://open.spotify.com/playlist/abc%2F..%2Fx", "https://open.spotify.com/playlist/ab-c",
            "spotify:playlist:abc", "open.spotify.com/playlist/abc", "", "not a url"
    })
    void rejectsAnythingElse(String url) {
        assertThat(MediaMetadataService.extractSpotifyPlaylistId(url)).isNull();
    }

    @Test
    void rejectsNullAndOverlongInput() {
        assertThat(MediaMetadataService.extractSpotifyPlaylistId(null)).isNull();
        assertThat(MediaMetadataService.extractSpotifyPlaylistId(
                "https://open.spotify.com/playlist/abc?x=" + "a".repeat(500))).isNull();
    }

    @Test
    void surroundingWhitespaceIsIgnored() {
        assertThat(MediaMetadataService.extractSpotifyPlaylistId("  https://open.spotify.com/playlist/abc123 \n"))
                .isEqualTo("abc123");
    }
}
