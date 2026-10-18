package com.bracketbattle.controller;

import com.bracketbattle.media.MediaMetadataService;
import com.bracketbattle.media.MediaUrls;
import com.bracketbattle.ratelimit.RateLimiter;
import com.bracketbattle.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.List;
import java.util.Map;

/** Lookups for the bracket creator. Signed-in users only, with their own per-user limits. */
@RestController
@RequestMapping("/metadata")
public class MediaMetadataController {

    private final MediaMetadataService metadataService;
    private final RateLimiter rateLimiter;

    public MediaMetadataController(MediaMetadataService metadataService, RateLimiter rateLimiter) {
        this.metadataService = metadataService;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/youtube/search")
    public Map<String, String> searchYouTube(@RequestParam String query, Authentication authentication) {
        if (query.isBlank() || query.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search query must be 1 to 200 characters");
        }
        rateLimiter.tryAcquire("metadata-search", CurrentUser.uidOrNull(authentication));
        String mediaUrl = metadataService.findEmbeddableYouTubeUrl(query);
        if (mediaUrl == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No embeddable YouTube video found");
        }
        return Map.of("mediaUrl", mediaUrl);
    }

    @GetMapping("/spotify/playlist")
    public List<Map<String, String>> getSpotifyPlaylistTracks(@RequestParam String url, Authentication authentication) {
        String playlistId = MediaMetadataService.extractSpotifyPlaylistId(url);
        if (playlistId == null) {
            URI uri = MediaUrls.parse(url);
            String message = uri != null && MediaUrls.isSpotifyShortLinkHost(uri.getHost())
                    ? "Spotify short links (spotify.link) aren't supported; open the link and copy the open.spotify.com address"
                    : "Not a Spotify playlist link (expected https://open.spotify.com/playlist/…)";
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        rateLimiter.tryAcquire("metadata-playlist", CurrentUser.uidOrNull(authentication));
        return metadataService.getSpotifyPlaylistTracks(playlistId);
    }
}
