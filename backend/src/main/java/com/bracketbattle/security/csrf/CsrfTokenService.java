package com.bracketbattle.security.csrf;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for generating and validating CSRF tokens.
 * Uses double-submit cookie pattern suitable for stateless authentication.
 */
@Service
public class CsrfTokenService {

    private static final int TOKEN_LENGTH = 32;
    private final SecureRandom secureRandom = new SecureRandom();

    // Cache of valid tokens per user (with expiration)
    // Key: userId, Value: Map of token -> expiration timestamp
    private final Map<String, Map<String, Long>> userTokens = new ConcurrentHashMap<>();

    // Token validity period: 1 hour
    private static final long TOKEN_VALIDITY_MS = 60 * 60 * 1000;

    /**
     * Generate a new CSRF token for a user.
     * Token is stored with expiration timestamp.
     *
     * @param userId The Firebase UID of the user
     * @return Base64-encoded CSRF token
     */
    public String generateToken(String userId) {
        byte[] tokenBytes = new byte[TOKEN_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        // Store token with expiration
        long expirationTime = System.currentTimeMillis() + TOKEN_VALIDITY_MS;
        userTokens.computeIfAbsent(userId, k -> new ConcurrentHashMap<>())
                  .put(token, expirationTime);

        // Clean up expired tokens for this user
        cleanupExpiredTokens(userId);

        return token;
    }

    /**
     * Validate a CSRF token for a user.
     * Checks if token exists and hasn't expired.
     *
     * @param userId The Firebase UID of the user
     * @param token The token to validate
     * @return true if token is valid, false otherwise
     */
    public boolean validateToken(String userId, String token) {
        if (userId == null || token == null) {
            return false;
        }

        Map<String, Long> tokens = userTokens.get(userId);
        if (tokens == null) {
            return false;
        }

        Long expirationTime = tokens.get(token);
        if (expirationTime == null) {
            return false;
        }

        // Check if token has expired
        if (System.currentTimeMillis() > expirationTime) {
            // Remove expired token
            tokens.remove(token);
            return false;
        }

        return true;
    }

    /**
     * Invalidate a specific token for a user.
     *
     * @param userId The Firebase UID of the user
     * @param token The token to invalidate
     */
    public void invalidateToken(String userId, String token) {
        Map<String, Long> tokens = userTokens.get(userId);
        if (tokens != null) {
            tokens.remove(token);
        }
    }

    /**
     * Invalidate all tokens for a user (e.g., on logout).
     *
     * @param userId The Firebase UID of the user
     */
    public void invalidateAllTokens(String userId) {
        userTokens.remove(userId);
    }

    /**
     * Clean up expired tokens for a user to prevent memory leaks.
     *
     * @param userId The Firebase UID of the user
     */
    private void cleanupExpiredTokens(String userId) {
        Map<String, Long> tokens = userTokens.get(userId);
        if (tokens != null) {
            long now = System.currentTimeMillis();
            tokens.entrySet().removeIf(entry -> entry.getValue() < now);
        }
    }

    /**
     * Clean up all expired tokens across all users.
     * Should be called periodically by a scheduled task.
     */
    public void cleanupAllExpiredTokens() {
        long now = System.currentTimeMillis();
        userTokens.forEach((userId, tokens) ->
            tokens.entrySet().removeIf(entry -> entry.getValue() < now)
        );
        // Remove users with no tokens
        userTokens.entrySet().removeIf(entry -> entry.getValue().isEmpty());
    }
}

