package com.bracketbattle.security;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

public final class CurrentUser {

    private CurrentUser() {}

    /** The Firebase uid of a signed-in caller, or null for guests. */
    public static String uidOrNull(Authentication authentication) {
        if (authentication instanceof UsernamePasswordAuthenticationToken token
                && token.getPrincipal() instanceof String uid) {
            return uid;
        }
        return null;
    }

    /** Whether the caller has ROLE_ADMIN (see FirebaseAuthenticationFilter for the claims). */
    public static boolean isAdmin(Authentication authentication) {
        return uidOrNull(authentication) != null && authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
