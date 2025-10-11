package com.bracketbattle.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Filter to add Cache-Control headers to prevent caching of sensitive data.
 * This affects HTTP-level caching (browsers/proxies), NOT server-side Redis caching.
 */
@Component
public class CacheControlFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String uri = httpRequest.getRequestURI();

        // Only add no-cache headers for truly sensitive user-specific endpoints
        // that should never be cached by browsers
        if (uri.matches(".*\\/users\\/[^/]+\\/results.*") ||
            uri.matches(".*\\/brackets\\/\\d+\\/users\\/[^/]+\\/results.*")) {

            httpResponse.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            httpResponse.setHeader("Pragma", "no-cache");
            httpResponse.setHeader("Expires", "0");
        }
        // Allow short-term caching for public bracket data and results
        // This won't affect server-side Redis caching, only browser caching
        else if (uri.startsWith("/brackets") && "GET".equalsIgnoreCase(httpRequest.getMethod())) {
            httpResponse.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
        }
        // Allow caching for popular/static endpoints
        else if (uri.contains("/popular") && "GET".equalsIgnoreCase(httpRequest.getMethod())) {
            httpResponse.setHeader("Cache-Control", "public, max-age=120");
        }

        chain.doFilter(request, response);
    }
}
