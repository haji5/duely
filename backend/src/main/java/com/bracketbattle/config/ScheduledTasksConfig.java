package com.bracketbattle.config;

import com.bracketbattle.security.csrf.CsrfTokenService;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Configuration for scheduled tasks.
 * Includes CSRF token cleanup to prevent memory leaks.
 */
@Configuration
@EnableScheduling
public class ScheduledTasksConfig {

    private final CsrfTokenService csrfTokenService;

    public ScheduledTasksConfig(CsrfTokenService csrfTokenService) {
        this.csrfTokenService = csrfTokenService;
    }

    /**
     * Clean up expired CSRF tokens every 10 minutes.
     * Prevents memory leaks from accumulating expired tokens.
     */
    @Scheduled(fixedRate = 600000) // 10 minutes
    public void cleanupExpiredCsrfTokens() {
        csrfTokenService.cleanupAllExpiredTokens();
    }
}

