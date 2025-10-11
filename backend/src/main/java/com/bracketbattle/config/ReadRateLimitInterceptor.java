package com.bracketbattle.config;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate limiter for read operations to prevent data scraping and DoS attacks.
 * Limits requests per IP address on public read endpoints.
 */
@Component
public class ReadRateLimitInterceptor implements HandlerInterceptor {

    // Store rate limiters per IP address
    private final ConcurrentHashMap<String, RateLimiter> ipLimiters = new ConcurrentHashMap<>();

    // Allow 100 requests per minute per IP for read operations
    private final RateLimiterConfig config = RateLimiterConfig.custom()
            .limitForPeriod(100)
            .limitRefreshPeriod(Duration.ofMinutes(1))
            .timeoutDuration(Duration.ZERO)
            .build();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Only apply to GET requests (read operations)
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String clientIp = getClientIp(request);
        RateLimiter rateLimiter = ipLimiters.computeIfAbsent(
            clientIp,
            ip -> RateLimiter.of("read-limit-" + ip, config)
        );

        try {
            if (!rateLimiter.acquirePermission()) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"Too Many Requests\",\"message\":\"Rate limit exceeded. Please slow down.\"}");
                return false;
            }
        } catch (RequestNotPermitted e) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Too Many Requests\",\"message\":\"Rate limit exceeded. Please slow down.\"}");
            return false;
        }

        return true;
    }

    /**
     * Extract client IP address from request, considering proxy headers.
     */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // Take first IP if there are multiple (in case of proxy chain)
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip != null ? ip : "unknown";
    }
}

