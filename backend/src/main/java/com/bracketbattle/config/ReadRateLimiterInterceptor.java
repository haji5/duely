package com.bracketbattle.config;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Interceptor to rate limit GET requests based on IP address.
 * Prevents abuse of read endpoints that could overload the database.
 */
@Component
public class ReadRateLimiterInterceptor implements HandlerInterceptor {

    private final ConcurrentHashMap<String, RateLimiter> ipRateLimiters = new ConcurrentHashMap<>();
    private final RateLimiterRegistry rateLimiterRegistry;

    @Autowired
    public ReadRateLimiterInterceptor(
            @Value("${ratelimiter.read.limit-for-period:100}") int limitForPeriod,
            @Value("${ratelimiter.read.limit-refresh-period:60}") int refreshPeriodSeconds) {
        // Configure rate limiter with values from application.properties
        RateLimiterConfig config = RateLimiterConfig.custom()
                .limitForPeriod(limitForPeriod)
                .limitRefreshPeriod(Duration.ofSeconds(refreshPeriodSeconds))
                .timeoutDuration(Duration.ZERO)
                .build();
        
        this.rateLimiterRegistry = RateLimiterRegistry.of(config);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String method = request.getMethod();
        
        // Only rate limit GET requests (read operations)
        if (!"GET".equalsIgnoreCase(method)) {
            return true;
        }

        // Get client IP address
        String clientIp = getClientIpAddress(request);
        
        // Get or create rate limiter for this IP
        RateLimiter rateLimiter = ipRateLimiters.computeIfAbsent(
            clientIp, 
            ip -> rateLimiterRegistry.rateLimiter("read-" + ip)
        );

        // acquirePermission() returns false (it does not throw) when the limit is exceeded
        if (!rateLimiter.acquirePermission()) {
            // Rate limit exceeded
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write(
                "{\"error\":\"Too Many Requests\"," +
                "\"message\":\"Rate limit exceeded. Please slow down your requests.\"," +
                "\"retryAfter\":\"60 seconds\"}"
            );
            return false;
        }
        return true;
    }

    /**
     * Client IP address. With server.forward-headers-strategy=framework, Spring's
     * ForwardedHeaderFilter already resolves getRemoteAddr() from X-Forwarded-For, which the
     * nginx proxy overwrites with the real client address. Parsing the raw header here would
     * let clients pick their own rate-limit bucket by sending a spoofed X-Forwarded-For.
     */
    private String getClientIpAddress(HttpServletRequest request) {
        return request.getRemoteAddr();
    }
}
