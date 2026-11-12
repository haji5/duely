package com.bracketbattle.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Per-client limit on GET (and HEAD, which runs the same handler) requests: per IPv4 address or IPv6
 * /64 (ClientSubject). getRemoteAddr() is already the real client address: nginx
 * overwrites X-Forwarded-For, clears any client Forwarded header (which Spring would prefer), and
 * Spring's forward-headers-strategy applies it.
 */
@Component
public class ReadRateLimitInterceptor implements HandlerInterceptor {

    private final RateLimiter rateLimiter;

    public ReadRateLimitInterceptor(RateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod())) {
            rateLimiter.tryAcquire("read", ClientSubject.of(request));
        }
        return true;
    }
}
