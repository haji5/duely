package com.bracketbattle.security.csrf;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;

/**
 * Filter that validates CSRF tokens for state-changing requests.
 * Uses double-submit cookie pattern for stateless authentication.
 *
 * Security approach:
 * 1. CSRF token is sent in both a cookie (HttpOnly, SameSite) and a request header
 * 2. The filter validates that both values match and are valid
 * 3. Only applies to authenticated state-changing operations (POST, PUT, DELETE)
 * 4. GET requests are exempt (idempotent operations)
 */
@Component
public class CsrfTokenFilter extends OncePerRequestFilter {

    private static final Logger logger = LoggerFactory.getLogger(CsrfTokenFilter.class);

    private static final String CSRF_TOKEN_HEADER = "X-CSRF-Token";
    private static final String CSRF_TOKEN_COOKIE = "XSRF-TOKEN";

    private final CsrfTokenService csrfTokenService;

    public CsrfTokenFilter(CsrfTokenService csrfTokenService) {
        this.csrfTokenService = csrfTokenService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String method = request.getMethod();
        String path = request.getRequestURI();

        // Skip CSRF validation for:
        // 1. Safe HTTP methods (GET, HEAD, OPTIONS, TRACE)
        // 2. Public endpoints (no authentication required)
        // 3. Health/actuator endpoints
        if (isSafeMethod(method) || isPublicEndpoint(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Get authenticated user
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated() ||
            authentication.getPrincipal().equals("anonymousUser")) {
            // Not authenticated - let Spring Security handle it
            filterChain.doFilter(request, response);
            return;
        }

        String userId = (String) authentication.getPrincipal();

        // Get CSRF token from header
        String headerToken = request.getHeader(CSRF_TOKEN_HEADER);

        // Get CSRF token from cookie
        String cookieToken = getCsrfTokenFromCookie(request);

        // Validate tokens
        if (headerToken == null || cookieToken == null) {
            logger.warn("CSRF token missing for user {} on {} {}", userId, method, path);
            sendCsrfError(response, "CSRF token missing");
            return;
        }

        if (!headerToken.equals(cookieToken)) {
            logger.warn("CSRF token mismatch for user {} on {} {}", userId, method, path);
            sendCsrfError(response, "CSRF token mismatch");
            return;
        }

        if (!csrfTokenService.validateToken(userId, headerToken)) {
            logger.warn("Invalid CSRF token for user {} on {} {}", userId, method, path);
            sendCsrfError(response, "Invalid or expired CSRF token");
            return;
        }

        // CSRF validation passed
        filterChain.doFilter(request, response);
    }

    /**
     * Check if HTTP method is safe (doesn't modify state).
     */
    private boolean isSafeMethod(String method) {
        return "GET".equalsIgnoreCase(method) ||
               "HEAD".equalsIgnoreCase(method) ||
               "OPTIONS".equalsIgnoreCase(method) ||
               "TRACE".equalsIgnoreCase(method);
    }

    /**
     * Check if endpoint is public (doesn't require CSRF protection).
     */
    private boolean isPublicEndpoint(String path) {
        return path.startsWith("/actuator") ||
               path.startsWith("/health") ||
               path.startsWith("/info");
    }

    /**
     * Extract CSRF token from cookies.
     */
    private String getCsrfTokenFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        return Arrays.stream(cookies)
                .filter(cookie -> CSRF_TOKEN_COOKIE.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    /**
     * Send CSRF validation error response.
     */
    private void sendCsrfError(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write(String.format(
            "{\"error\":\"CSRF Validation Failed\",\"message\":\"%s\"}",
            message
        ));
    }
}

