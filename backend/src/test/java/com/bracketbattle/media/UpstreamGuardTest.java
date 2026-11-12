package com.bracketbattle.media;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static com.bracketbattle.media.UpstreamGuard.Upstream.SPOTIFY;
import static com.bracketbattle.media.UpstreamGuard.Upstream.YOUTUBE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class UpstreamGuardTest {

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-11T12:00:00Z"));

    @Test
    void noMoreThanTheLimitRunAtOnceAndTheRestAreTurnedAwayAfterWaiting() throws Exception {
        UpstreamGuard guard = new UpstreamGuard(2, Duration.ofMillis(200), clock, meters);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger running = new AtomicInteger();
        AtomicInteger mostAtOnce = new AtomicInteger();
        ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
        try {
            Future<?> a = pool.submit(() -> guard.call(YOUTUBE, () -> hold(running, mostAtOnce, release)));
            Future<?> b = pool.submit(() -> guard.call(SPOTIFY, () -> hold(running, mostAtOnce, release)));
            while (running.get() < 2) Thread.onSpinWait();

            // Both slots are taken, whichever upstream asks: the third waits, then gets a 503.
            ResponseStatusException busy = catchThrowableOfType(ResponseStatusException.class,
                    () -> guard.call(YOUTUBE, () -> "never"));
            assertThat(busy.getStatusCode().value()).isEqualTo(503);
            assertThat(meters.get("duely.scrape.rejected").tag("upstream", "youtube").tag("reason", "busy").counter().count())
                    .isEqualTo(1);

            release.countDown();
            a.get(5, TimeUnit.SECONDS);
            b.get(5, TimeUnit.SECONDS);
            assertThat(mostAtOnce.get()).isEqualTo(2);
            assertThat(guard.call(YOUTUBE, () -> "free again")).isEqualTo("free again");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void repeatedFailuresPauseOneUpstreamForAMinute() {
        UpstreamGuard guard = new UpstreamGuard(4, Duration.ofSeconds(1), clock, meters);
        for (int i = 0; i < UpstreamGuard.FAILURES_TO_OPEN; i++) {
            ResponseStatusException failed = catchThrowableOfType(ResponseStatusException.class,
                    () -> guard.call(YOUTUBE, () -> { throw new IOException("timeout"); }));
            assertThat(failed.getStatusCode().value()).isEqualTo(502);
            assertThat(failed.getReason()).isEqualTo("YouTube is unavailable right now");
        }
        assertThat(meters.get("duely.scrape.failures").tag("upstream", "youtube").counter().count())
                .isEqualTo(UpstreamGuard.FAILURES_TO_OPEN);

        AtomicInteger calls = new AtomicInteger();
        ResponseStatusException paused = catchThrowableOfType(ResponseStatusException.class,
                () -> guard.call(YOUTUBE, calls::incrementAndGet));
        assertThat(paused.getStatusCode().value()).isEqualTo(503);
        assertThat(paused.getReason()).contains("paused");
        assertThat(calls.get()).isZero();
        assertThat(meters.get("duely.scrape.rejected").tag("reason", "paused").counter().count()).isEqualTo(1);
        // Spotify has its own breaker.
        assertThat(guard.call(SPOTIFY, () -> "fine")).isEqualTo("fine");

        // After the pause one failure pauses it again; a success closes it for good.
        clock.advance(UpstreamGuard.OPEN_FOR);
        catchThrowableOfType(ResponseStatusException.class, () -> guard.call(YOUTUBE, () -> { throw new IOException("still down"); }));
        assertThat(catchThrowableOfType(ResponseStatusException.class, () -> guard.call(YOUTUBE, () -> "x"))
                .getStatusCode().value()).isEqualTo(503);
        clock.advance(UpstreamGuard.OPEN_FOR);
        assertThat(guard.call(YOUTUBE, () -> "back")).isEqualTo("back");
        catchThrowableOfType(ResponseStatusException.class, () -> guard.call(YOUTUBE, () -> { throw new IOException("blip"); }));
        assertThat(guard.call(YOUTUBE, () -> "one blip doesn't pause")).isEqualTo("one blip doesn't pause");
    }

    @Test
    void anUnrecognisedAnswerIsAFailureWithItsReasonAndOtherErrorsPassThrough() {
        UpstreamGuard guard = new UpstreamGuard(4, Duration.ofSeconds(1), clock, meters);
        ResponseStatusException failed = catchThrowableOfType(ResponseStatusException.class,
                () -> guard.call(SPOTIFY, () -> { throw new UpstreamGuard.Failure("playlist format not recognised"); }));
        assertThat(failed.getStatusCode().value()).isEqualTo(502);
        assertThat(failed.getReason()).isEqualTo("Spotify: playlist format not recognised");

        IllegalStateException bug = catchThrowableOfType(IllegalStateException.class,
                () -> guard.call(SPOTIFY, () -> { throw new IllegalStateException("bug"); }));
        assertThat(bug).hasMessage("bug");
        assertThat(meters.get("duely.scrape.failures").tag("upstream", "spotify").counter().count()).isEqualTo(1);
    }

    private static String hold(AtomicInteger running, AtomicInteger mostAtOnce, CountDownLatch release) {
        mostAtOnce.accumulateAndGet(running.incrementAndGet(), Math::max);
        try {
            release.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        running.decrementAndGet();
        return "done";
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
