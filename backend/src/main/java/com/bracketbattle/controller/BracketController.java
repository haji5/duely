package com.bracketbattle.controller;

import com.bracketbattle.dto.AddItemRequest;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.service.BracketService;
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
// CORS centralized in SecurityConfig
public class BracketController {

    @Autowired
    private BracketService bracketService;

    @Autowired
    private com.bracketbattle.config.RateLimiterConfig rateLimiterConfig;

    @Autowired
    private RateLimiterRegistry rateLimiterRegistry;

    // Rate limiters for bracket and item creation
    private final RateLimiter bracketCreationLimiter;
    private final RateLimiter itemCreationLimiter;

    public BracketController() {
        // Limit bracket creation: 10 per hour per user
        io.github.resilience4j.ratelimiter.RateLimiterConfig bracketConfig =
                io.github.resilience4j.ratelimiter.RateLimiterConfig.custom()
                        .limitForPeriod(10)
                        .limitRefreshPeriod(java.time.Duration.ofHours(1))
                        .timeoutDuration(java.time.Duration.ZERO)
                        .build();
        bracketCreationLimiter = RateLimiter.of("bracket-creation", bracketConfig);

        // Limit item creation: 50 per hour per user
        io.github.resilience4j.ratelimiter.RateLimiterConfig itemConfig =
                io.github.resilience4j.ratelimiter.RateLimiterConfig.custom()
                        .limitForPeriod(50)
                        .limitRefreshPeriod(java.time.Duration.ofHours(1))
                        .timeoutDuration(java.time.Duration.ZERO)
                        .build();
        itemCreationLimiter = RateLimiter.of("item-creation", itemConfig);
    }

    @GetMapping("/brackets")
    public ResponseEntity<List<Bracket>> getAllBrackets() {
        List<Bracket> brackets = bracketService.getAllBrackets();
        return ResponseEntity.ok(brackets);
    }

    @GetMapping("/brackets/{id}")
    public ResponseEntity<Bracket> getBracket(@PathVariable Long id) {
        return bracketService.getBracketById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/brackets/{id}/items")
    public ResponseEntity<List<Item>> getBracketItems(@PathVariable Long id) {
        List<Item> items = bracketService.getBracketItems(id);
        return ResponseEntity.ok(items);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/results")
    public ResponseEntity<?> saveBracketResult(
            @PathVariable Long id,
            @Valid @RequestBody SaveResultRequest payload,
            Authentication authentication) {

        String userId = (String) authentication.getPrincipal();

        // Get per-user rate limiter
        RateLimiter rateLimiter = rateLimiterConfig.getRateLimiterForUser(userId, rateLimiterRegistry);

        try {
            // Attempt to acquire permission from rate limiter
            return RateLimiter.decorateSupplier(rateLimiter, () -> {
                Result result = bracketService.saveBracketResult(id, userId, payload.getRanking(), payload.getSubmissionToken());
                return ResponseEntity.ok(result);
            }).get();
        } catch (RequestNotPermitted e) {
            // Rate limit exceeded - return 429 Too Many Requests
            return rateLimitExceededFallback();
        }
    }

    /**
     * Fallback method for rate limit exceeded scenarios.
     * Returns HTTP 429 Too Many Requests with helpful message.
     */
    private ResponseEntity<?> rateLimitExceededFallback() {
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "You have exceeded the rate limit. Maximum 5 submissions per minute allowed.",
                        "retryAfter", "60 seconds"
                ));
    }

    @GetMapping("/brackets/{id}/results")
    public ResponseEntity<List<Result>> getBracketResults(@PathVariable Long id) {
        List<Result> results = bracketService.getBracketResults(id);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/brackets/{id}/rankings")
    public ResponseEntity<List<ItemRankingDto>> getBracketRankings(@PathVariable Long id) {
        List<ItemRankingDto> rankings = bracketService.getBracketRankings(id);
        return ResponseEntity.ok(rankings);
    }

    @GetMapping("/brackets/popular")
    public ResponseEntity<List<Bracket>> getPopularBrackets() {
        List<Bracket> brackets = bracketService.getPopularBrackets();
        return ResponseEntity.ok(brackets);
    }

    @GetMapping("/brackets/by-creator/{creatorId}")
    public ResponseEntity<List<Bracket>> getBracketsByCreator(@PathVariable String creatorId) {
        List<Bracket> brackets = bracketService.getBracketsByCreator(creatorId);
        return ResponseEntity.ok(brackets);
    }

    @GetMapping("/users/{userId}/results")
    public ResponseEntity<List<Result>> getUserResults(@PathVariable String userId, Authentication authentication) {
        // Only allow users to view their own results to prevent enumeration
        if (authentication != null && authentication.isAuthenticated()) {
            String requestingUserId = (String) authentication.getPrincipal();
            if (!requestingUserId.equals(userId)) {
                // Return 403 Forbidden if trying to access another user's results
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        } else {
            // Unauthenticated users cannot access user-specific results
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<Result> results = bracketService.getUserResults(userId);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/brackets/{id}/users/{userId}/results")
    public ResponseEntity<List<Result>> getUserBracketResults(
            @PathVariable Long id,
            @PathVariable String userId,
            Authentication authentication) {
        // Only allow users to view their own results to prevent enumeration
        if (authentication != null && authentication.isAuthenticated()) {
            String requestingUserId = (String) authentication.getPrincipal();
            if (!requestingUserId.equals(userId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<Result> results = bracketService.getUserBracketResults(id, userId);
        return ResponseEntity.ok(results);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets")
    public ResponseEntity<?> createBracket(@Valid @RequestBody CreateBracketRequest payload, Authentication authentication) {
        String createdBy = (String) authentication.getPrincipal();

        // Throttle bracket creation: 10 requests per hour per user
        if (!bracketCreationLimiter.acquirePermission()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "Bracket creation limit exceeded. Maximum 10 brackets per hour allowed.",
                        "retryAfter", "Please try again later"
                    ));
        }

        Bracket bracket = bracketService.createBracket(payload.getName(), payload.getDescription(), payload.getType(), payload.getCategory(), createdBy);
        return ResponseEntity.ok(bracket);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/items")
    public ResponseEntity<?> addItemToBracket(
            @PathVariable Long id,
            @Valid @RequestBody AddItemRequest payload) {

        // Throttle item creation: 50 requests per hour per user
        if (!itemCreationLimiter.acquirePermission()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "Item addition limit exceeded. Maximum 50 items per hour allowed.",
                        "retryAfter", "Please try again later"
                    ));
        }

        Item item = bracketService.addItemToBracket(id, payload.getTitle(), payload.getMediaUrl(), payload.getMediaType());
        return ResponseEntity.ok(item);
    }
}
