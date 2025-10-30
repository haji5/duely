package com.bracketbattle.controller;

import com.bracketbattle.security.csrf.CsrfTokenService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Controller for CSRF token management.
 * Provides endpoints for authenticated users to obtain CSRF tokens.
 */
@RestController
public class CsrfController {

    private static final String CSRF_TOKEN_COOKIE = "XSRF-TOKEN";
    private static final int COOKIE_MAX_AGE = 3600; // 1 hour

    private final CsrfTokenService csrfTokenService;

    public CsrfController(CsrfTokenService csrfTokenService) {
        this.csrfTokenService = csrfTokenService;
    }

    /**
     * Generate and return a CSRF token for the authenticated user.
     * Token is set in both:
     * 1. Response body (for JavaScript to read and include in request headers)
     * 2. HttpOnly cookie (for double-submit validation)
     *
     * This endpoint should be called after authentication to obtain a token.
     */
    @PreAuthorize("hasRole('USER')")
    @GetMapping("/csrf-token")
    public ResponseEntity<Map<String, String>> getCsrfToken(
            Authentication authentication,
            HttpServletResponse response) {

        String userId = (String) authentication.getPrincipal();
        String token = csrfTokenService.generateToken(userId);

        // Set token in cookie for double-submit pattern
        Cookie cookie = new Cookie(CSRF_TOKEN_COOKIE, token);
        cookie.setHttpOnly(false); // JavaScript needs to read this
        cookie.setSecure(true); // Only send over HTTPS in production
        cookie.setPath("/");
        cookie.setMaxAge(COOKIE_MAX_AGE);
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);

        // Also return in response body for convenience
        return ResponseEntity.ok(Map.of(
            "token", token,
            "expiresIn", String.valueOf(COOKIE_MAX_AGE)
        ));
    }

    /**
     * Invalidate the current user's CSRF tokens (e.g., on logout).
     */
    @PreAuthorize("hasRole('USER')")
    @PostMapping("/csrf-token/invalidate")
    public ResponseEntity<Map<String, String>> invalidateCsrfToken(
            Authentication authentication,
            HttpServletResponse response) {

        String userId = (String) authentication.getPrincipal();
        csrfTokenService.invalidateAllTokens(userId);

        // Clear the cookie
        Cookie cookie = new Cookie(CSRF_TOKEN_COOKIE, "");
        cookie.setHttpOnly(false);
        cookie.setSecure(true);
        cookie.setPath("/");
        cookie.setMaxAge(0); // Delete cookie
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);

        return ResponseEntity.ok(Map.of(
            "message", "CSRF tokens invalidated successfully"
        ));
    }
}

