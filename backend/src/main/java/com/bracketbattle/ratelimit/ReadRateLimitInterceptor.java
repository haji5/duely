package com.bracketbattle.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Per-IP limit on GET requests. getRemoteAddr() is already the real client address: nginx
 * overwrites X-Forwarded-For and Spring's forward-headers-strategy applies it.
 */
@Component
public class ReadRateLimitInterceptor implements HandlerInterceptor {

    private final RateLimiter rateLimiter;

    public ReadRateLimitInterceptor(RateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("GET".equals(request.getMethod())) {
            rateLimiter.tryAcquire("read", request.getRemoteAddr());
        }
        return true;
    }
}
