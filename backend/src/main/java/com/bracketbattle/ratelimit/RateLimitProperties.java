package com.bracketbattle.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Fixed-window limits per bucket, e.g. {@code app.rate-limit.buckets.read.limit=300} and
 * {@code app.rate-limit.buckets.read.period-seconds=60}. Defaults live in application.properties.
 */
@ConfigurationProperties("app.rate-limit")
public record RateLimitProperties(Map<String, Limit> buckets) {

    public record Limit(int limit, long periodSeconds) {}

    public Limit get(String bucket) {
        Limit limit = buckets == null ? null : buckets.get(bucket);
        if (limit == null) {
            throw new IllegalStateException("No rate limit configured for bucket '" + bucket + "'");
        }
        return limit;
    }
}
