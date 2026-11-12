package com.bracketbattle.seo;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;

/**
 * The built SPA shell (index.html), fetched from the frontend container and kept in memory for a
 * short TTL so a new frontend deploy is picked up within seconds. Not in Valkey: it's one small
 * document per instance, not shared data. If a refresh fails the last good copy is served (and
 * retried after another TTL); with no copy at all the page answers 503, which nginx turns into the
 * static shell.
 */
@Component
public class SpaShell {

    private static final Logger log = LoggerFactory.getLogger(SpaShell.class);

    private record Cached(Document document, Instant fetchedAt) {}

    private final String location;
    private final Duration ttl;
    private final ResourceLoader resourceLoader;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private volatile Cached cached;
    // A lock rather than synchronized: callers that find it taken return the stale copy instead
    // of waiting, and it doesn't pin a virtual thread to its carrier during the fetch.
    private final ReentrantLock refreshLock = new ReentrantLock();

    public SpaShell(@Value("${app.spa-index-url}") String location,
                    @Value("${app.spa-index-ttl:30s}") Duration ttl,
                    ResourceLoader resourceLoader) {
        this.location = location;
        this.ttl = ttl;
        this.resourceLoader = resourceLoader;
    }

    /**
     * A fresh copy of the shell to edit. One caller refreshes an expired copy while everyone else
     * keeps getting the stale one, so page requests never queue behind the fetch. Only the very
     * first requests, before any copy exists, wait for it.
     */
    public Document get() {
        Cached current = cached;
        if (current != null && isFresh(current)) {
            return current.document().clone();
        }
        if (current != null) {
            if (!refreshLock.tryLock()) {
                return current.document().clone();
            }
        } else {
            refreshLock.lock();
        }
        try {
            current = cached;
            if (current != null && isFresh(current)) {
                return current.document().clone();
            }
            return refresh(current).clone();
        } finally {
            refreshLock.unlock();
        }
    }

    /** Fetches the shell; on failure keeps {@code previous} (if any) for another TTL. */
    private Document refresh(Cached previous) {
        try {
            Document document = Jsoup.parse(fetch());
            if (document.getElementById("root") == null) {
                throw new IOException("no #root element");
            }
            document.outputSettings().prettyPrint(false);
            cached = new Cached(document, Instant.now());
            return document;
        } catch (IOException e) {
            if (previous == null) {
                log.warn("SPA shell unavailable from {}: {}", location, e.getMessage());
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Page shell unavailable");
            }
            log.warn("SPA shell refresh from {} failed, serving the previous copy: {}", location, e.getMessage());
            cached = new Cached(previous.document(), Instant.now());
            return previous.document();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (previous != null) return previous.document();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Page shell unavailable");
        }
    }

    private boolean isFresh(Cached entry) {
        return entry.fetchedAt().plus(ttl).isAfter(Instant.now());
    }

    /** http(s) URLs are fetched with short timeouts; anything else (classpath:, file:) is a Spring resource. */
    private String fetch() throws IOException, InterruptedException {
        if (!location.startsWith("http://") && !location.startsWith("https://")) {
            return resourceLoader.getResource(location).getContentAsString(StandardCharsets.UTF_8);
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(location)).timeout(Duration.ofSeconds(3)).GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() != 200) {
            throw new IOException("HTTP " + response.statusCode());
        }
        return response.body();
    }
}
