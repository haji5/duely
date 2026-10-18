package com.bracketbattle.ratelimit;

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
            Map.of("read", new RateLimitProperties.Limit(3, 60)));
    // 1_000_000_042 s: window index 16666667 for 60 s windows, 38 s left in the window
    private final Clock clock = Clock.fixed(Instant.ofEpochSecond(1_000_000_042), ZoneOffset.UTC);
    private final RateLimiter limiter = new RateLimiter(redis, props, clock);

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
        RateLimitExceededException ex = catchThrowableOfType(() -> limiter.tryAcquire("read", "ip"), RateLimitExceededException.class);

        assertThat(ex.getRetryAfterSeconds()).isEqualTo(38);
        assertThat(ex.getHeaders().getFirst("Retry-After")).isEqualTo("38");
        assertThat(ex.getStatusCode().value()).isEqualTo(429);
    }

    @Test
    void failsOpenWhenValkeyIsDown() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        assertThatCode(() -> limiter.tryAcquire("read", "ip")).doesNotThrowAnyException();
    }
}
