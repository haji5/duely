package com.bracketbattle.ratelimit;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
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
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Fixed-window rate limiter backed by Valkey ({@link RateLimitStore}: in Compose its own instance,
 * which never evicts), so limits are shared by every backend instance and memory stays bounded
 * (each window's counter expires with the window). If that Valkey is unreachable or full, reads
 * fail open, because an outage should not take the game down; every other bucket keeps its limit
 * in a bounded in-process map (per instance), so a Valkey restart does not lift the limits on
 * writes and upstream lookups. Either way it logs a throttled warning.
 *
 * <p>Refused requests are counted per bucket in {@code duely.rate_limit.rejections}.
 */
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);
    private static final long WARN_INTERVAL_MS = 60_000;
    private static final Set<String> FAIL_OPEN_BUCKETS = Set.of("read");
    // Per bucket. Ten thousand live subjects in one window is far beyond this game's traffic.
    private static final int LOCAL_MAX_SUBJECTS = 10_000;

    // KEYS[1] = counter key for the current window, ARGV[1] = window length in seconds
    private static final RedisScript<Long> INCREMENT = new DefaultRedisScript<>(
            "local c = redis.call('INCR', KEYS[1]) "
                    + "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end "
                    + "return c", Long.class);

    private final StringRedisTemplate redis;
    private final RateLimitProperties properties;
    private final Clock clock;
    private final MeterRegistry meters;
    private final AtomicLong lastWarning = new AtomicLong();
    private final LocalWindowCounter local = new LocalWindowCounter(LOCAL_MAX_SUBJECTS);

    @Autowired
    public RateLimiter(RateLimitStore store, RateLimitProperties properties, MeterRegistry meters) {
        this(store.template(), properties, Clock.systemUTC(), meters);
    }

    RateLimiter(StringRedisTemplate redis, RateLimitProperties properties, Clock clock, MeterRegistry meters) {
        this.redis = redis;
        this.properties = properties;
        this.clock = clock;
        this.meters = meters;
    }

    /**
     * Counts one request for {@code subject} (a uid, or a client address from ClientSubject) in {@code bucket}.
     *
     * @throws RateLimitExceededException when the bucket's limit for the current window is used up
     */
    public void tryAcquire(String bucket, String subject) {
        RateLimitProperties.Limit limit = properties.get(bucket);
        long now = clock.millis() / 1000;
        long period = limit.periodSeconds();
        Long count = increment(bucket, subject, now, period);
        if (count != null && count > limit.limit()) {
            rejections(bucket).increment();
            long retryAfter = period - (now % period);
            throw new RateLimitExceededException(describe(limit.limit(), period, retryAfter), retryAfter);
        }
    }

    /**
     * Counts one use of {@code bucket} by {@code subject} and says whether it was within the
     * limit, without throwing. For quotas whose excess is handled quietly rather than refused,
     * such as runs that are saved but no longer counted toward the leaderboard.
     */
    public boolean tryConsume(String bucket, String subject) {
        RateLimitProperties.Limit limit = properties.get(bucket);
        long now = clock.millis() / 1000;
        Long count = increment(bucket, subject, now, limit.periodSeconds());
        return count == null || count <= limit.limit();
    }

    /**
     * The window's new count. While Valkey is unreachable: null (fail open) for reads, the count
     * kept in this process for everything else.
     */
    private Long increment(String bucket, String subject, long now, long period) {
        Long count;
        try {
            count = redis.execute(INCREMENT, List.of(windowKey(bucket, subject, now, period)), Long.toString(period));
        } catch (DataAccessException e) {
            long nowMs = clock.millis();
            long last = lastWarning.get();
            if (nowMs - last > WARN_INTERVAL_MS && lastWarning.compareAndSet(last, nowMs)) {
                log.warn("The limits Valkey is unreachable or full: reads are not rate limited and other limits count on this instance only: {}",
                        e.getMessage());
            }
            return FAIL_OPEN_BUCKETS.contains(bucket) ? null : local.increment(bucket, String.valueOf(subject), now, period);
        }
        if (!local.isEmpty()) {
            local.clear(); // Valkey counts again; the local windows would only go stale
        }
        return count;
    }

    private Counter rejections(String bucket) {
        return Counter.builder("duely.rate_limit.rejections")
                .description("Requests refused by a rate limit")
                .tag("bucket", bucket)
                .register(meters);
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
