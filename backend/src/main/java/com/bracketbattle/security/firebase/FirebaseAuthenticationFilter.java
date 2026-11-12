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
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Turns a valid Firebase ID token into an authenticated principal (the uid). Custom claims
 * {"role":"ADMIN"} or {"admin":true} grant ROLE_ADMIN.
 *
 * <p>A token that fails verification is handled by method. On a write it is a 401 with
 * {@code WWW-Authenticate: Bearer error="invalid_token"}: carrying on as a guest would save a
 * signed-in player's run anonymously (out of their history, against the guest limits) and answer
 * 200, which the client could neither notice nor repair. The client refreshes its token and
 * retries. On a safe method (GET, HEAD, OPTIONS) the request continues anonymously, so public
 * reads stay available even if verification itself is broken; protected reads then answer 401.
 * No Authorization header at all always means a guest.
 */
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(FirebaseAuthenticationFilter.class);
    private static final long WARN_INTERVAL_MS = 60_000;
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    static final String INVALID_TOKEN_MESSAGE = "Your sign-in has expired. Please sign in again.";

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
                // Visible (throttled) so a misconfigured Firebase project shows up in the logs.
                long now = System.currentTimeMillis();
                long last = lastWarning.get();
                if (now - last > WARN_INTERVAL_MS && lastWarning.compareAndSet(last, now)) {
                    log.warn("Rejected a Firebase ID token on {} {}: {}", request.getMethod(), request.getRequestURI(), e.getMessage());
                }
                SecurityContextHolder.clearContext();
                if (!SAFE_METHODS.contains(request.getMethod())) {
                    rejectInvalidToken(response);
                    return;
                }
            }
        }
        filterChain.doFilter(request, response);
    }

    private static void rejectInvalidToken(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"invalid_token\"");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        // The same shape GlobalExceptionHandler uses, so the client shows the message.
        response.getWriter().write("{\"timestamp\":\"" + Instant.now() + "\",\"status\":401,"
                + "\"error\":\"Unauthorized\",\"message\":\"" + INVALID_TOKEN_MESSAGE + "\"}");
    }

    private static List<GrantedAuthority> authorities(Map<String, Object> claims) {
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        if (claims.get("role") instanceof String role && !role.isBlank()) {
            // Locale.ROOT: in a Turkish locale "admin".toUpperCase() is "ADMİN", which never matches.
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(Locale.ROOT)));
        }
        if (claims.get("admin") instanceof Boolean admin && admin) {
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        return authorities;
    }
}
