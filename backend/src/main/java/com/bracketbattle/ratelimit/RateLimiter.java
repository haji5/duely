package com.bracketbattle.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Fixed-window rate limiter backed by Valkey, so limits are shared by every backend instance and
 * memory stays bounded (each window's counter expires with the window). If Valkey is unreachable
 * the limiter fails open: it logs a throttled warning and lets the request through, because a
 * cache outage should not take the game down.
 */
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);
    private static final long WARN_INTERVAL_MS = 60_000;

    // KEYS[1] = counter key for the current window, ARGV[1] = window length in seconds
    private static final RedisScript<Long> INCREMENT = new DefaultRedisScript<>(
            "local c = redis.call('INCR', KEYS[1]) "
                    + "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end "
                    + "return c", Long.class);

    private final StringRedisTemplate redis;
    private final RateLimitProperties properties;
    private final Clock clock;
    private final AtomicLong lastWarning = new AtomicLong();

    @Autowired
    public RateLimiter(StringRedisTemplate redis, RateLimitProperties properties) {
        this(redis, properties, Clock.systemUTC());
    }

    RateLimiter(StringRedisTemplate redis, RateLimitProperties properties, Clock clock) {
        this.redis = redis;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * Counts one request for {@code subject} (a uid or client IP) in {@code bucket}.
     *
     * @throws RateLimitExceededException when the bucket's limit for the current window is used up
     */
    public void tryAcquire(String bucket, String subject) {
        RateLimitProperties.Limit limit = properties.get(bucket);
        long now = clock.millis() / 1000;
        long period = limit.periodSeconds();
        Long count;
        try {
            count = redis.execute(INCREMENT, List.of(windowKey(bucket, subject, now, period)), Long.toString(period));
        } catch (DataAccessException e) {
            long nowMs = clock.millis();
            long last = lastWarning.get();
            if (nowMs - last > WARN_INTERVAL_MS && lastWarning.compareAndSet(last, nowMs)) {
                log.warn("Rate limiting is disabled while Valkey is unreachable: {}", e.getMessage());
            }
            return;
        }
        if (count != null && count > limit.limit()) {
            long retryAfter = period - (now % period);
            throw new RateLimitExceededException(describe(limit.limit(), period, retryAfter), retryAfter);
        }
    }

    static String windowKey(String bucket, String subject, long epochSecond, long periodSeconds) {
        return "ratelimit:" + bucket + ":" + subject + ":" + (epochSecond / periodSeconds);
    }

    static String describe(int limit, long periodSeconds, long retryAfterSeconds) {
        String per = switch ((int) Math.min(periodSeconds, Integer.MAX_VALUE)) {
            case 60 -> "minute";
            case 3600 -> "hour";
            case 86400 -> "day";
            default -> periodSeconds + " seconds";
        };
        return "Too many requests: the limit is " + limit + " per " + per
                + ". Try again in " + retryAfterSeconds + " seconds.";
    }
}
