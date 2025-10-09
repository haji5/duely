package com.bracketbattle.config;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
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
    public ReadRateLimiterInterceptor() {
        // Configure rate limiter: 30 requests per minute for read operations
        RateLimiterConfig config = RateLimiterConfig.custom()
                .limitForPeriod(30)
                .limitRefreshPeriod(Duration.ofMinutes(1))
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

        try {
            // Try to acquire permission
            rateLimiter.acquirePermission();
            return true;
        } catch (RequestNotPermitted e) {
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
    }

    /**
     * Extract client IP address, considering proxy headers.
     */
    private String getClientIpAddress(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        
        return request.getRemoteAddr();
    }
}

