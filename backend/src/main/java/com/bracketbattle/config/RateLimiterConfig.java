package com.bracketbattle.config;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
public class RateLimiterConfig {

    private final ConcurrentHashMap<String, RateLimiter> userRateLimiters = new ConcurrentHashMap<>();

    @Bean
    public RateLimiterRegistry rateLimiterRegistry() {
        io.github.resilience4j.ratelimiter.RateLimiterConfig config = io.github.resilience4j.ratelimiter.RateLimiterConfig.custom()
                .limitForPeriod(5)  // 5 submissions
                .limitRefreshPeriod(Duration.ofMinutes(1))  // per minute
                .timeoutDuration(Duration.ZERO)  // fail immediately if limit exceeded
                .build();

        return RateLimiterRegistry.of(config);
    }

    /**
     * Get or create a rate limiter for a specific user.
     * This allows per-user rate limiting rather than global rate limiting.
     */
    public RateLimiter getRateLimiterForUser(String userId, RateLimiterRegistry registry) {
        return userRateLimiters.computeIfAbsent(userId,
            id -> registry.rateLimiter("user-" + id));
    }
}
