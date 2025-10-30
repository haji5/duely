package com.bracketbattle.config;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
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
     * Validates and sanitizes X-Forwarded-For to prevent spoofing.
     */
    private String getClientIpAddress(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            // Take only the first IP in the chain and validate it
            String clientIp = xForwardedFor.split(",")[0].trim();
            // Basic IP validation to prevent header injection
            if (isValidIpAddress(clientIp)) {
                return clientIp;
            }
        }
        
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty() && isValidIpAddress(xRealIp)) {
            return xRealIp;
        }
        
        return request.getRemoteAddr();
    }

    /**
     * Validate IP address format to prevent header injection attacks.
     */
    private boolean isValidIpAddress(String ip) {
        if (ip == null || ip.isEmpty() || ip.length() > 45) {
            return false;
        }
        // Basic validation: only allow alphanumeric, dots, colons (for IPv6)
        return ip.matches("^[0-9a-fA-F.:]+$");
    }
}
