package com.bracketbattle.security;

import com.bracketbattle.security.csrf.CsrfTokenFilter;
import com.bracketbattle.security.firebase.FirebaseAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.XXssProtectionHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Value("${spring.web.cors.allowed-origins:http://localhost:3000}")
    private List<String> allowedOrigins;

    private final FirebaseAuthenticationFilter firebaseAuthenticationFilter;
    private final CsrfTokenFilter csrfTokenFilter;

    public SecurityConfig(FirebaseAuthenticationFilter firebaseAuthenticationFilter,
                         CsrfTokenFilter csrfTokenFilter) {
        this.firebaseAuthenticationFilter = firebaseAuthenticationFilter;
        this.csrfTokenFilter = csrfTokenFilter;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            // CSRF protection enabled with custom filter for stateless JWT authentication
            // Using double-submit cookie pattern instead of default session-based CSRF
            .csrf(csrf -> csrf.disable()) // Disable default CSRF, use custom filter instead
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/", "/actuator/**", "/brackets",
                        "/brackets/*", "/brackets/*/items",
                        "/brackets/*/results", "/brackets/*/rankings",
                        "/brackets/popular", "/csrf-token").permitAll()
                // User-specific endpoints require authentication
                .requestMatchers("/users/*/results", "/brackets/*/users/*/results", "/brackets/by-creator/*").authenticated()
                .anyRequest().authenticated()
            )
            .headers(headers -> {
                headers.httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000));
                headers.contentSecurityPolicy(csp -> csp
                    .policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com https://*.googleusercontent.com; media-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.googlevideo.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"));
                headers.xssProtection(xss -> xss.headerValue(XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK));
                headers.contentTypeOptions(Customizer.withDefaults());
                headers.referrerPolicy(rp -> rp.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN));
                headers.permissionsPolicy(pp -> pp.policy("geolocation=(), microphone=(), camera=(), fullscreen=(self)"));
                headers.frameOptions(fo -> fo.deny());
                headers.cacheControl(cc -> cc.disable()); // Let application control caching
            })
            .addFilterBefore(firebaseAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(csrfTokenFilter, FirebaseAuthenticationFilter.class) // Add CSRF filter after authentication
            .httpBasic(Customizer.withDefaults());

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(Arrays.asList("GET","POST","PUT","DELETE","OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("Authorization","Cache-Control","Content-Type","X-CSRF-Token"));
        configuration.setExposedHeaders(Arrays.asList("X-CSRF-Token")); // Allow frontend to read CSRF token header
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
