package com.bracketbattle.ratelimit;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RateLimiterTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final RateLimitProperties props = new RateLimitProperties(
            Map.of("read", new RateLimitProperties.Limit(3, 60),
                    "result-ip", new RateLimitProperties.Limit(2, 60),
                    "counted-ip", new RateLimitProperties.Limit(1, 86400)));
    // 1_000_000_042 s: window index 16666667 for 60 s windows, 38 s left in the window
    private final Clock clock = Clock.fixed(Instant.ofEpochSecond(1_000_000_042), ZoneOffset.UTC);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final RateLimiter limiter = new RateLimiter(redis, props, clock, meters);

    @Test
    void windowKeyEncodesBucketSubjectAndWindow() {
        assertThat(RateLimiter.windowKey("read", "1.2.3.4", 1_000_000_042, 60)).isEqualTo("ratelimit:read:1.2.3.4:16666667");
        assertThat(RateLimiter.windowKey("read", "1.2.3.4", 1_000_000_079, 60)).isEqualTo("ratelimit:read:1.2.3.4:16666667");
        assertThat(RateLimiter.windowKey("read", "1.2.3.4", 1_000_000_080, 60)).isEqualTo("ratelimit:read:1.2.3.4:16666668");
    }

    @Test
    void messageIsDerivedFromConfiguredLimit() {
        assertThat(RateLimiter.describe(5, 60, 12)).isEqualTo("Too many requests: the limit is 5 per minute. Try again in 12 seconds.");
        assertThat(RateLimiter.describe(10, 3600, 99)).contains("10 per hour");
        assertThat(RateLimiter.describe(7, 90, 1)).contains("7 per 90 seconds");
    }

    @Test
    void allowsUpToTheLimitThenThrowsWithRetryAfter() {
        when(redis.execute(any(RedisScript.class), eq(List.of("ratelimit:read:ip:16666667")), anyString()))
                .thenReturn(3L, 4L);

        assertThatCode(() -> limiter.tryAcquire("read", "ip")).doesNotThrowAnyException();
        RateLimitExceededException ex = catchThrowableOfType(RateLimitExceededException.class, () -> limiter.tryAcquire("read", "ip"));

        assertThat(ex.getRetryAfterSeconds()).isEqualTo(38);
        assertThat(ex.getHeaders().getFirst("Retry-After")).isEqualTo("38");
        assertThat(ex.getStatusCode().value()).isEqualTo(429);
        assertThat(meters.get("duely.rate_limit.rejections").tag("bucket", "read").counter().count()).isEqualTo(1);
    }

    @Test
    void failsOpenForReadsWhenValkeyIsDown() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        for (int i = 0; i < 10; i++) {
            assertThatCode(() -> limiter.tryAcquire("read", "ip")).doesNotThrowAnyException();
        }
    }

    @Test
    void keepsLimitingWritesInProcessWhenValkeyIsDown() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        for (int i = 0; i < 2; i++) {
            assertThatCode(() -> limiter.tryAcquire("result-ip", "ip")).doesNotThrowAnyException();
        }
        RateLimitExceededException ex = catchThrowableOfType(RateLimitExceededException.class,
                () -> limiter.tryAcquire("result-ip", "ip"));
        assertThat(ex.getRetryAfterSeconds()).isEqualTo(38);
        // Another subject has its own window.
        assertThatCode(() -> limiter.tryAcquire("result-ip", "other")).doesNotThrowAnyException();
    }

    @Test
    void localWindowsEndWithTheirPeriod() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        MutableClock time = new MutableClock(1_000_000_042);
        RateLimiter limiter = new RateLimiter(redis, props, time, meters);
        limiter.tryAcquire("result-ip", "ip");
        limiter.tryAcquire("result-ip", "ip");
        assertThatThrownBy(() -> limiter.tryAcquire("result-ip", "ip")).isInstanceOf(RateLimitExceededException.class);

        time.epochSecond = 1_000_000_080; // next 60 s window
        assertThatCode(() -> limiter.tryAcquire("result-ip", "ip")).doesNotThrowAnyException();
    }

    @Test
    void keepsQuotasInProcessWhenValkeyIsDown() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        assertThat(limiter.tryConsume("counted-ip", "7:ip")).isTrue();
        assertThat(limiter.tryConsume("counted-ip", "7:ip")).isFalse();
        assertThat(limiter.tryConsume("counted-ip", "8:ip")).isTrue();
    }

    @Test
    void forgetsLocalCountsOnceValkeyIsBack() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"))
                .thenThrow(new RedisConnectionFailureException("down"))
                .thenReturn(1L)
                .thenThrow(new RedisConnectionFailureException("down again"));
        limiter.tryAcquire("result-ip", "ip");
        limiter.tryAcquire("result-ip", "ip");
        limiter.tryAcquire("result-ip", "ip"); // Valkey answers: its count is the one that applies
        assertThatCode(() -> limiter.tryAcquire("result-ip", "ip")).doesNotThrowAnyException();
    }

    @Test
    void aFullLocalBucketCountsNewSubjectsAsOverTheLimit() {
        LocalWindowCounter counter = new LocalWindowCounter(2);
        assertThat(counter.increment("b", "one", 1_000, 60)).isEqualTo(1);
        assertThat(counter.increment("b", "two", 1_000, 60)).isEqualTo(1);
        assertThat(counter.increment("b", "three", 1_000, 60)).isEqualTo(Long.MAX_VALUE);
        assertThat(counter.increment("b", "one", 1_000, 60)).as("known subjects still count").isEqualTo(2);
        assertThat(counter.increment("other", "three", 1_000, 60)).as("buckets are separate").isEqualTo(1);
        // Ended windows are dropped, which frees the bucket.
        assertThat(counter.increment("b", "three", 1_061, 60)).isEqualTo(1);
    }

    private static final class MutableClock extends Clock {
        long epochSecond;

        MutableClock(long epochSecond) {
            this.epochSecond = epochSecond;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochSecond(epochSecond);
        }
    }
}
