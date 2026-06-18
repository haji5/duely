package com.bracketbattle.controller;

import com.bracketbattle.dto.AddItemRequest;
import com.bracketbattle.dto.BulkAddItemsRequest;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.service.BracketService;
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
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

    // Rate limiter configurations
    private final RateLimiterConfig bracketCreationConfig;
    private final RateLimiterConfig itemCreationConfig;

    public BracketController(
            @Value("${ratelimiter.bracket-creation.limit-for-period:10}") int bracketLimit,
            @Value("${ratelimiter.bracket-creation.limit-refresh-period:3600}") int bracketRefreshSeconds,
            @Value("${ratelimiter.item-creation.limit-for-period:200}") int itemLimit,
            @Value("${ratelimiter.item-creation.limit-refresh-period:3600}") int itemRefreshSeconds) {

        // Configure bracket creation rate limiter
        this.bracketCreationConfig = RateLimiterConfig.custom()
                .limitForPeriod(bracketLimit)
                .limitRefreshPeriod(Duration.ofSeconds(bracketRefreshSeconds))
                .timeoutDuration(Duration.ZERO)
                .build();

        // Configure item creation rate limiter
        this.itemCreationConfig = RateLimiterConfig.custom()
                .limitForPeriod(itemLimit)
                .limitRefreshPeriod(Duration.ofSeconds(itemRefreshSeconds))
                .timeoutDuration(Duration.ZERO)
                .build();
    }

    /**
     * Get or create a per-user rate limiter for bracket creation.
     */
    private RateLimiter getBracketCreationLimiter(String userId) {
        return rateLimiterRegistry.rateLimiter("bracket-creation-" + userId, bracketCreationConfig);
    }

    /**
     * Get or create a per-user rate limiter for item creation.
     */
    private RateLimiter getItemCreationLimiter(String userId) {
        return rateLimiterRegistry.rateLimiter("item-creation-" + userId, itemCreationConfig);
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

    @PostMapping("/brackets/{id}/results")
    public ResponseEntity<?> saveBracketResult(
            @PathVariable Long id,
            @Valid @RequestBody SaveResultRequest payload,
            Authentication authentication,
            jakarta.servlet.http.HttpServletRequest request) {

        final String userId;
        if (authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getPrincipal())) {
            userId = (String) authentication.getPrincipal();
        } else {
            userId = null;
        }

        // Get per-user rate limiter (fallback to IP for anonymous users)
        String rateLimitKey = userId != null ? userId : "ip:" + request.getRemoteAddr();
        RateLimiter rateLimiter = rateLimiterConfig.getRateLimiterForUser(rateLimitKey, rateLimiterRegistry);

        try {
            // Attempt to acquire permission from rate limiter
            return RateLimiter.decorateSupplier(rateLimiter, () -> {
                Result result = bracketService.saveBracketResult(id, userId, payload.getRanking(), payload.getSubmissionToken(), payload.getDisplayName(), payload.getComment());
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
    public ResponseEntity<List<Bracket>> getBracketsByCreator(
            @PathVariable String creatorId,
            Authentication authentication) {
        // Only allow users to view their own created brackets to prevent user enumeration
        if (authentication != null && authentication.isAuthenticated()) {
            String requestingUserId = (String) authentication.getPrincipal();
            if (!requestingUserId.equals(creatorId)) {
                // Return 403 Forbidden if trying to access another user's brackets
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        } else {
            // Unauthenticated users cannot access creator-specific brackets
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

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

        // SECURITY: Prevent caching of user-specific data
        return ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore().mustRevalidate())
                .header("X-Content-Type-Options", "nosniff")
                .body(results);
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

        // SECURITY: Prevent caching of user-specific data
        return ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore().mustRevalidate())
                .header("X-Content-Type-Options", "nosniff")
                .body(results);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets")
    public ResponseEntity<?> createBracket(@Valid @RequestBody CreateBracketRequest payload, Authentication authentication) {
        String createdBy = (String) authentication.getPrincipal();

        // Get per-user rate limiter for bracket creation
        RateLimiter rateLimiter = getBracketCreationLimiter(createdBy);

        try {
            // Attempt to acquire permission from rate limiter
            if (!rateLimiter.acquirePermission()) {
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(Map.of(
                            "error", "Too Many Requests",
                            "message", "Bracket creation limit exceeded. Maximum 10 brackets per hour allowed.",
                            "retryAfter", "Please try again later"
                        ));
            }

            Bracket bracket = bracketService.createBracket(payload.getName(), payload.getDescription(), payload.getType(), payload.getCategory(), createdBy);
            return ResponseEntity.ok(bracket);
        } catch (RequestNotPermitted e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "Bracket creation limit exceeded. Maximum 10 brackets per hour allowed.",
                        "retryAfter", "Please try again later"
                    ));
        }
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/items")
    public ResponseEntity<?> addItemToBracket(
            @PathVariable Long id,
            @Valid @RequestBody AddItemRequest payload,
            Authentication authentication) {

        String userId = (String) authentication.getPrincipal();

        // Get per-user rate limiter for item creation
        RateLimiter rateLimiter = getItemCreationLimiter(userId);

        try {
            // Attempt to acquire permission from rate limiter
            if (!rateLimiter.acquirePermission()) {
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(Map.of(
                            "error", "Too Many Requests",
                            "message", "Item addition limit exceeded. Maximum 200 items per hour allowed. Use bulk endpoint for adding many items at once.",
                            "retryAfter", "Please try again later"
                        ));
            }

            Item item = bracketService.addItemToBracket(id, userId, payload.getTitle(), payload.getMediaUrl(), payload.getMediaType());
            return ResponseEntity.ok(item);
        } catch (RequestNotPermitted e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "Item addition limit exceeded. Maximum 200 items per hour allowed. Use bulk endpoint for adding many items at once.",
                        "retryAfter", "Please try again later"
                    ));
        }
    }

    /**
     * Bulk add multiple items to a bracket at once.
     * This is much more efficient than calling the single-item endpoint multiple times.
     * Uses bracket creation limiter (10 per hour) since creating a bracket with items
     * is typically done as a single operation.
     */
    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/items/bulk")
    public ResponseEntity<?> bulkAddItemsToBracket(
            @PathVariable Long id,
            @Valid @RequestBody BulkAddItemsRequest payload,
            Authentication authentication) {

        String userId = (String) authentication.getPrincipal();

        // Get per-user rate limiter for bracket creation (bulk operations)
        RateLimiter rateLimiter = getBracketCreationLimiter(userId);

        try {
            // Attempt to acquire permission from rate limiter
            if (!rateLimiter.acquirePermission()) {
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(Map.of(
                            "error", "Too Many Requests",
                            "message", "Bulk operation limit exceeded. Maximum 10 bulk operations per hour allowed.",
                            "retryAfter", "Please try again later"
                        ));
            }

            // Convert DTOs to service layer data objects
            List<BracketService.ItemData> itemsData = payload.getItems().stream()
                    .map(item -> new BracketService.ItemData(
                        item.getTitle(),
                        item.getMediaUrl(),
                        item.getMediaType()
                    ))
                    .collect(java.util.stream.Collectors.toList());

            List<Item> items = bracketService.bulkAddItemsToBracket(id, userId, itemsData);
            return ResponseEntity.ok(Map.of(
                "items", items,
                "count", items.size(),
                "message", "Successfully added " + items.size() + " items"
            ));
        } catch (RequestNotPermitted e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of(
                        "error", "Too Many Requests",
                        "message", "Bulk operation limit exceeded. Maximum 10 bulk operations per hour allowed.",
                        "retryAfter", "Please try again later"
                    ));
        }
    }
}
