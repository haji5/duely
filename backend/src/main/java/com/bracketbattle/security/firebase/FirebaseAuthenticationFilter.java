package com.bracketbattle.security.firebase;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Turns a valid Firebase ID token into an authenticated principal (the uid). An invalid or
 * expired token leaves the request anonymous, so public endpoints keep working; protected ones
 * then answer 401. Custom claims {"role":"ADMIN"} or {"admin":true} grant ROLE_ADMIN.
 */
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(FirebaseAuthenticationFilter.class);
    private static final long WARN_INTERVAL_MS = 60_000;

    private final FirebaseAuth firebaseAuth;
    private final AtomicLong lastWarning = new AtomicLong();

    public FirebaseAuthenticationFilter(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                FirebaseToken decoded = firebaseAuth.verifyIdToken(authHeader.substring(7));
                SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(decoded.getUid(), null, authorities(decoded.getClaims())));
            } catch (Exception e) {
                // Visible (throttled) so a misconfigured Firebase project doesn't silently turn
                // every signed-in run into a guest run.
                long now = System.currentTimeMillis();
                long last = lastWarning.get();
                if (now - last > WARN_INTERVAL_MS && lastWarning.compareAndSet(last, now)) {
                    log.warn("Rejected a Firebase ID token, continuing as anonymous: {}", e.getMessage());
                }
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private static List<GrantedAuthority> authorities(Map<String, Object> claims) {
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        if (claims.get("role") instanceof String role && !role.isBlank()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
        }
        if (claims.get("admin") instanceof Boolean admin && admin) {
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        return authorities;
    }
}
