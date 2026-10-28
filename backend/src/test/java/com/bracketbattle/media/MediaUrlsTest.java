package com.bracketbattle.media;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class MediaUrlsTest {

    @Test
    void youTubeHostsAreCaseInsensitive() {
        assertThat(MediaUrls.youTubeVideoId("https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThat(MediaUrls.youTubeVideoId("https://YOUTU.BE/dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
    }

    @Test
    void youTubeIdsTolerateFragmentsTrailingSlashesAndSurroundingSpace() {
        assertThat(MediaUrls.youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=30")).isEqualTo("dQw4w9WgXcQ");
        assertThat(MediaUrls.youTubeVideoId("https://www.youtube.com/watch/?v=dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThat(MediaUrls.youTubeVideoId("https://www.youtube.com/v/dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThat(MediaUrls.youTubeVideoId("  https://youtu.be/dQw4w9WgXcQ  ")).isEqualTo("dQw4w9WgXcQ");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://www.youtube.com/watch?v=", "https://www.youtube.com/watch?vv=dQw4w9WgXcQ",
            "https://www.youtube.com/watch", "https://youtu.be/", "https://www.youtube.com/shorts/",
            "https://www.youtube.com/watchx?v=dQw4w9WgXcQ", "https://www.youtube.com/user/dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXc!", "youtu.be/dQw4w9WgXcQ", "", "   ",
            "https://notyoutu.be/dQw4w9WgXcQ"
    })
    void rejectsLinksWithoutAVideoId(String url) {
        assertThat(MediaUrls.youTubeVideoId(url)).isNull();
    }

    @Test
    void nullIsNotAVideo() {
        assertThat(MediaUrls.youTubeVideoId(null)).isNull();
        assertThat(MediaUrls.parse(null)).isNull();
    }

    @Test
    void spotifyPaths() {
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/track/abc")).isTrue();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/embed/playlist/abc/")).isTrue();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/intl-pt-BR/artist/abc")).isTrue();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/track/")).isFalse();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/track/abc/extra")).isFalse();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/track/" + "a".repeat(65))).isFalse();
        assertThat(MediaUrls.isEmbeddableSpotifyPath("/user/abc")).isFalse();
        assertThat(MediaUrls.isEmbeddableSpotifyPath(null)).isFalse();
    }

    @Test
    void spotifyHosts() {
        assertThat(MediaUrls.isSpotifyHost("OPEN.spotify.com")).isTrue();
        assertThat(MediaUrls.isSpotifyHost("open.spotify.com.evil.com")).isFalse();
        assertThat(MediaUrls.isSpotifyHost(null)).isFalse();
        assertThat(MediaUrls.isSpotifyShortLinkHost("SPOTIFY.LINK")).isTrue();
        assertThat(MediaUrls.isSpotifyShortLinkHost("xyz.spotify.link")).isTrue();
        assertThat(MediaUrls.isSpotifyShortLinkHost("notspotify.link")).isFalse();
    }
}
