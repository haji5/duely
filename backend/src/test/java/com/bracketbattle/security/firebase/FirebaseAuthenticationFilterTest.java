package com.bracketbattle.security.firebase;

import com.bracketbattle.security.CurrentUser;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseAuthenticationFilterTest {

    private final FirebaseAuth firebaseAuth = mock(FirebaseAuth.class);
    private final FirebaseAuthenticationFilter filter = new FirebaseAuthenticationFilter(firebaseAuth);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** What one request through the filter produced. */
    private record Outcome(boolean chainCalled, Authentication authentication, MockHttpServletResponse response) {}

    private Outcome run(String method, String authorization) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, "/brackets/1/results");
        if (authorization != null) request.addHeader("Authorization", authorization);
        boolean[] called = new boolean[1];
        Authentication[] seen = new Authentication[1];
        MockFilterChain chain = new MockFilterChain() {
            @Override
            public void doFilter(ServletRequest req, ServletResponse res) {
                called[0] = true;
                seen[0] = SecurityContextHolder.getContext().getAuthentication();
            }
        };
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return new Outcome(called[0], seen[0], response);
    }

    /** Runs a GET through the filter and returns the authentication the rest of the chain sees. */
    private Authentication run(String authorization) throws Exception {
        Outcome outcome = run("GET", authorization);
        assertThat(outcome.chainCalled()).isTrue();
        return outcome.authentication();
    }

    private void stub(String token, String uid, Map<String, Object> claims) throws Exception {
        FirebaseToken decoded = mock(FirebaseToken.class);
        when(decoded.getUid()).thenReturn(uid);
        when(decoded.getClaims()).thenReturn(claims);
        doReturn(decoded).when(firebaseAuth).verifyIdToken(token);
    }

    private static List<String> roles(Authentication auth) {
        return auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    }

    @Test
    void validTokenAuthenticatesTheUid() throws Exception {
        stub("good", "uid-1", Map.of());
        Authentication auth = run("Bearer good");
        assertThat(CurrentUser.uidOrNull(auth)).isEqualTo("uid-1");
        assertThat(roles(auth)).containsExactly("ROLE_USER");
    }

    @Test
    void adminClaimsGrantRoleAdmin() throws Exception {
        stub("role", "uid-1", Map.of("role", "admin"));
        stub("flag", "uid-2", Map.of("admin", true));
        assertThat(roles(run("Bearer role"))).contains("ROLE_ADMIN");
        assertThat(roles(run("Bearer flag"))).contains("ROLE_ADMIN");
    }

    @Test
    void roleClaimIsUpperCasedLocaleIndependently() throws Exception {
        Locale previous = Locale.getDefault();
        Locale.setDefault(Locale.forLanguageTag("tr-TR"));
        try {
            stub("role", "uid-1", Map.of("role", "admin"));
            assertThat(roles(run("Bearer role"))).contains("ROLE_ADMIN");
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    void lookalikeAdminClaimsDoNotGrantAdmin() throws Exception {
        stub("t1", "uid-1", Map.of("admin", "true"));
        stub("t2", "uid-2", Map.of("admin", false));
        stub("t3", "uid-3", Map.of("role", "  "));
        stub("t4", "uid-4", Map.of("role", 1));
        for (String token : List.of("t1", "t2", "t3", "t4")) {
            assertThat(roles(run("Bearer " + token))).as(token).containsExactly("ROLE_USER");
        }
    }

    @Test
    void invalidTokenOnAWriteIsA401AndStopsTheChain() throws Exception {
        doThrow(new IllegalArgumentException("expired")).when(firebaseAuth).verifyIdToken(anyString());
        for (String method : List.of("POST", "PUT", "PATCH", "DELETE")) {
            Outcome outcome = run(method, "Bearer expired");
            assertThat(outcome.chainCalled()).as(method).isFalse();
            assertThat(outcome.response().getStatus()).as(method).isEqualTo(401);
            assertThat(outcome.response().getHeader("WWW-Authenticate")).isEqualTo("Bearer error=\"invalid_token\"");
            assertThat(outcome.response().getContentAsString()).contains("\"status\":401", "sign in again");
        }
    }

    @Test
    void invalidTokenOnASafeMethodContinuesAnonymously() throws Exception {
        doThrow(new IllegalArgumentException("expired")).when(firebaseAuth).verifyIdToken(anyString());
        for (String method : List.of("GET", "HEAD", "OPTIONS")) {
            Outcome outcome = run(method, "Bearer expired");
            assertThat(outcome.chainCalled()).as(method).isTrue();
            assertThat(outcome.authentication()).as(method).isNull();
        }
    }

    @Test
    void writesWithoutATokenAreGuestsAndValidTokensAuthenticate() throws Exception {
        Outcome guest = run("POST", null);
        assertThat(guest.chainCalled()).isTrue();
        assertThat(guest.authentication()).isNull();

        stub("good", "uid-1", Map.of());
        Outcome signedIn = run("POST", "Bearer good");
        assertThat(signedIn.chainCalled()).isTrue();
        assertThat(CurrentUser.uidOrNull(signedIn.authentication())).isEqualTo("uid-1");
    }

    @Test
    void invalidTokenLeavesTheRequestAnonymousAndDropsAnyEarlierAuthentication() throws Exception {
        doThrow(new IllegalArgumentException("bad")).when(firebaseAuth).verifyIdToken(anyString());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("stale", null, List.of()));
        assertThat(run("Bearer nope")).isNull();
    }

    @Test
    void nonBearerHeadersAreIgnored() throws Exception {
        assertThat(run(null)).isNull();
        assertThat(run("Basic dXNlcjpwYXNz")).isNull();
        assertThat(run("Bearer")).isNull();
        verify(firebaseAuth, never()).verifyIdToken(anyString());
    }

    @Test
    void anEmptyBearerTokenIsAnonymous() throws Exception {
        doThrow(new IllegalArgumentException("empty")).when(firebaseAuth).verifyIdToken("");
        assertThat(run("Bearer ")).isNull();
    }
}
