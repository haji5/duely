package com.bracketbattle.media;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Bounds what scraping can cost. At most {@link #MAX_CONCURRENT} lookups run at once on this
 * instance, whoever asks, so a slow upstream ties up a few requests rather than all of them, and
 * a burst of imports doesn't look like an attack to the site being scraped. Each upstream has a
 * breaker: after {@link #FAILURES_TO_OPEN} failures in a row its lookups are refused for
 * {@link #OPEN_FOR}; after that they are tried again, and the next failure pauses them again.
 *
 * <p>Counted in {@code duely.scrape.failures} (upstream errors and unrecognised pages) and
 * {@code duely.scrape.rejected} (refused here: {@code busy} or {@code paused}).
 */
@Component
public class UpstreamGuard {

    private static final Logger log = LoggerFactory.getLogger(UpstreamGuard.class);

    static final int MAX_CONCURRENT = 4;
    static final Duration MAX_WAIT = Duration.ofSeconds(10);
    static final int FAILURES_TO_OPEN = 5;
    static final Duration OPEN_FOR = Duration.ofSeconds(60);

    public enum Upstream {
        YOUTUBE("YouTube"), SPOTIFY("Spotify");

        final String label;

        Upstream(String label) {
            this.label = label;
        }
    }

    /** One lookup. A {@link Failure} or IOException counts against the upstream; anything else passes through. */
    @FunctionalInterface
    public interface Work<T> {
        T run() throws IOException, Failure;
    }

    /** The upstream answered, but not with anything usable (its page markup changed, an error status). */
    public static class Failure extends Exception {
        public Failure(String message) {
            super(message, null, false, false);
        }
    }

    private final Semaphore permits;
    private final Duration maxWait;
    private final Clock clock;
    private final MeterRegistry meters;
    private final Map<Upstream, Breaker> breakers = new EnumMap<>(Upstream.class);

    @Autowired
    public UpstreamGuard(MeterRegistry meters) {
        this(MAX_CONCURRENT, MAX_WAIT, Clock.systemUTC(), meters);
    }

    UpstreamGuard(int maxConcurrent, Duration maxWait, Clock clock, MeterRegistry meters) {
        this.permits = new Semaphore(maxConcurrent, true);
        this.maxWait = maxWait;
        this.clock = clock;
        this.meters = meters;
        for (Upstream upstream : Upstream.values()) {
            breakers.put(upstream, new Breaker());
        }
    }

    /**
     * Runs {@code work} once a slot is free. Refused with a 503 when none frees up in time or the
     * upstream's breaker is open; an upstream failure becomes a 502.
     */
    public <T> T call(Upstream upstream, Work<T> work) {
        Breaker breaker = breakers.get(upstream);
        if (!breaker.allows(clock.instant())) {
            rejected(upstream, "paused").increment();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    upstream.label + " lookups are paused after repeated failures. Try again in a minute.");
        }
        if (!acquire()) {
            rejected(upstream, "busy").increment();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Lookups are busy right now. Try again in a moment.");
        }
        try {
            T result = work.run();
            breaker.succeeded();
            return result;
        } catch (IOException | Failure e) {
            failures(upstream).increment();
            if (breaker.failed(clock.instant())) {
                log.warn("{} lookups paused for {} s after {} failures in a row", upstream.label, OPEN_FOR.toSeconds(), FAILURES_TO_OPEN);
            }
            log.warn("{} lookup failed: {}", upstream.label, e.toString());
            String message = e instanceof Failure ? upstream.label + ": " + e.getMessage()
                    : upstream.label + " is unavailable right now";
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
        } finally {
            permits.release();
        }
    }

    /** Closes every breaker, e.g. in tests. */
    public void reset() {
        breakers.values().forEach(Breaker::succeeded);
    }

    private boolean acquire() {
        try {
            return permits.tryAcquire(maxWait.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private Counter failures(Upstream upstream) {
        return Counter.builder("duely.scrape.failures")
                .description("Upstream lookups that failed or returned an unrecognised page")
                .tag("upstream", upstream.name().toLowerCase())
                .register(meters);
    }

    private Counter rejected(Upstream upstream, String reason) {
        return Counter.builder("duely.scrape.rejected")
                .description("Lookups refused before reaching the upstream")
                .tag("upstream", upstream.name().toLowerCase())
                .tag("reason", reason)
                .register(meters);
    }

    /** Consecutive failures, and until when the upstream is left alone. */
    private static final class Breaker {
        private int failures;
        private Instant openUntil = Instant.MIN;

        synchronized boolean allows(Instant now) {
            return !now.isBefore(openUntil);
        }

        synchronized void succeeded() {
            failures = 0;
            openUntil = Instant.MIN;
        }

        /** Records a failure; true when it opens the breaker. */
        synchronized boolean failed(Instant now) {
            failures++;
            if (failures >= FAILURES_TO_OPEN) {
                openUntil = now.plus(OPEN_FOR);
                return true;
            }
            return false;
        }
    }
}
