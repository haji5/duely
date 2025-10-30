package com.bracketbattle.service;

import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class BracketService {

    private static final Logger logger = LoggerFactory.getLogger(BracketService.class);
    private static final int MAX_ITEMS_PER_BRACKET = 500;
    private static final int MAX_RANKING_SIZE = 500;

    @Autowired
    private BracketRepository bracketRepository;

    @Autowired
    private ItemRepository itemRepository;

    @Autowired
    private ResultRepository resultRepository;

    @Autowired
    private RedissonClient redissonClient;

    @Cacheable(value = "brackets", unless = "#result == null || #result.isEmpty()")
    public List<Bracket> getAllBrackets() {
        return bracketRepository.findAll();
    }

    @Cacheable(value = "bracket", key = "#id", unless = "#result == null")
    public Optional<Bracket> getBracketById(Long id) {
        return bracketRepository.findById(id);
    }

    @Cacheable(value = "popularBrackets", unless = "#result == null || #result.isEmpty()")
    public List<Bracket> getPopularBrackets() {
        return bracketRepository.findPopularBrackets();
    }

    // Get brackets by creator - NOT CACHED to ensure immediate visibility of new brackets
    public List<Bracket> getBracketsByCreator(String createdBy) {
        return bracketRepository.findByCreatedByOrderByCreatedAtDesc(createdBy);
    }

    @Cacheable(value = "bracketItems", key = "#bracketId", unless = "#result == null || #result.isEmpty()")
    public List<Item> getBracketItems(Long bracketId) {
        return itemRepository.findByBracketId(bracketId);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    @Caching(evict = {
        @CacheEvict(value = "bracketResults", key = "#bracketId"), // Only evict this bracket's results
        @CacheEvict(value = "bracketRankings", key = "#bracketId"), // Also evict pre-calculated rankings
        @CacheEvict(value = "userResults", key = "'user:' + #userId"),
        @CacheEvict(value = "userResults", key = "'bracket:' + #bracketId + ':user:' + #userId"),
        @CacheEvict(value = "popularBrackets", allEntries = true),
        @CacheEvict(value = "bracket", key = "#bracketId")
    })
    public Result saveBracketResult(Long bracketId, String userId, List<Long> ranking, String submissionToken) {
        // Check for idempotency - if this submission token already exists, return the existing result
        Optional<Result> existingResult = resultRepository.findBySubmissionToken(submissionToken);
        if (existingResult.isPresent()) {
            // This is a duplicate submission (e.g., from double-clicking), return the existing result
            return existingResult.get();
        }

        // Basic validation: ensure bracket exists
        Bracket bracket = bracketRepository.findById(bracketId)
                .orElseThrow(() -> new IllegalArgumentException("Bracket not found with ID: " + bracketId));

        // Validate ranking is not empty
        if (ranking == null || ranking.isEmpty()) {
            throw new IllegalArgumentException("Ranking must not be empty");
        }

        // Validate ranking size
        if (ranking.size() > MAX_RANKING_SIZE) {
            throw new IllegalArgumentException("Ranking exceeds maximum size of " + MAX_RANKING_SIZE);
        }

        // Get all valid items for this bracket
        List<Item> items = itemRepository.findByBracketId(bracketId);
        Set<Long> validItemIds = new HashSet<>();
        for (Item i : items) {
            validItemIds.add(i.getId());
        }

        // CRITICAL VALIDATION 1: Check for duplicate item IDs in ranking
        Set<Long> uniqueRankingIds = new HashSet<>();
        for (Long itemId : ranking) {
            if (!uniqueRankingIds.add(itemId)) {
                throw new IllegalArgumentException(
                    "Ranking contains duplicate item ID: " + itemId + ". Each item must appear only once in the ranking."
                );
            }
        }

        // CRITICAL VALIDATION 2: Ensure all items in ranking belong to this bracket
        for (Long itemId : ranking) {
            if (!validItemIds.contains(itemId)) {
                throw new IllegalArgumentException(
                    "Ranking contains invalid item ID: " + itemId + ". This item does not belong to bracket ID: " + bracketId
                );
            }
        }

        // Create result with submission token
        Result result = new Result(bracketId, userId, ranking, submissionToken);

        try {
            return resultRepository.save(result);
        } catch (DataIntegrityViolationException e) {
            // If there's a unique constraint violation on submission_token,
            // it means another thread saved it first - fetch and return that result
            return resultRepository.findBySubmissionToken(submissionToken)
                    .orElseThrow(() -> new IllegalStateException("Concurrent submission failed"));
        }
    }

    @Cacheable(value = "bracketResults", key = "#bracketId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getBracketResults(Long bracketId) {
        return resultRepository.findByBracketIdOrderByCreatedAtDesc(bracketId);
    }

    @Cacheable(value = "bracketRankings", key = "#bracketId", unless = "#result == null || #result.isEmpty()")
    public List<ItemRankingDto> getBracketRankings(Long bracketId) {
        // Distributed lock key for this bracket's ranking calculation
        String lockKey = "lock:bracketRankings:" + bracketId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // Try to acquire lock with 10 second wait time and 30 second lease time
            // If we can't get the lock within 10 seconds, proceed without it
            boolean locked = lock.tryLock(10, 30, TimeUnit.SECONDS);

            if (locked) {
                logger.debug("Acquired distributed lock for bracket {} rankings calculation", bracketId);
                try {
                    return calculateBracketRankings(bracketId);
                } finally {
                    lock.unlock();
                    logger.debug("Released distributed lock for bracket {} rankings", bracketId);
                }
            } else {
                // Couldn't acquire lock in time, log warning and proceed
                logger.warn("Failed to acquire lock for bracket {} rankings within timeout, proceeding without lock", bracketId);
                return calculateBracketRankings(bracketId);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("Interrupted while waiting for lock for bracket {} rankings", bracketId, e);
            // Proceed without lock if interrupted
            return calculateBracketRankings(bracketId);
        } catch (Exception e) {
            logger.error("Error with distributed lock for bracket {} rankings, proceeding without lock", bracketId, e);
            // If there's any issue with the lock, proceed without it
            return calculateBracketRankings(bracketId);
        }
    }

    /**
     * Private method that performs the actual ranking calculation.
     * This is called by getBracketRankings() within the distributed lock.
     */
    private List<ItemRankingDto> calculateBracketRankings(Long bracketId) {
        // Fetch all results for this bracket
        List<Result> results = resultRepository.findByBracketIdOrderByCreatedAtDesc(bracketId);

        if (results.isEmpty()) {
            return List.of();
        }

        // Get all items for this bracket
        List<Item> items = itemRepository.findByBracketId(bracketId);

        // Calculate rankings server-side
        Map<Long, ItemStats> itemScores = new HashMap<>();

        for (Result result : results) {
            List<Long> ranking = result.getRanking();
            for (int i = 0; i < ranking.size(); i++) {
                Long itemId = ranking.get(i);

                ItemStats stats = itemScores.computeIfAbsent(itemId, id -> {
                    Item item = items.stream().filter(it -> it.getId().equals(id)).findFirst().orElse(null);
                    return new ItemStats(item);
                });

                // Add score based on position (higher position = higher score)
                stats.addScore(ranking.size() - i);

                // Calculate wins against other items
                for (int j = 0; j < ranking.size(); j++) {
                    Long otherItemId = ranking.get(j);
                    if (!itemId.equals(otherItemId)) {
                        stats.addMatch();
                        if (i < j) { // This item ranked higher
                            stats.addWin();
                        }
                    }
                }
            }
        }

        // Convert to DTOs and sort by average score
        return itemScores.values().stream()
                .filter(stats -> stats.getItem() != null)
                .sorted((a, b) -> Double.compare(b.getAverageScore(), a.getAverageScore()))
                .map(stats -> new ItemRankingDto(
                    stats.getItem(),
                    stats.getWins(),
                    stats.getTotalMatches(),
                    stats.getWinPercentage(),
                    stats.getAverageScore(),
                    stats.getTimesRanked()
                ))
                .collect(Collectors.toList());
    }

    @Cacheable(value = "userResults", key = "'user:' + #userId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getUserResults(String userId) {
        return resultRepository.findByUserId(userId);
    }

    @Cacheable(value = "userResults", key = "'bracket:' + #bracketId + ':user:' + #userId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getUserBracketResults(Long bracketId, String userId) {
        return resultRepository.findByBracketIdAndUserId(bracketId, userId);
    }

    @Caching(evict = {
        @CacheEvict(value = "brackets", allEntries = true),
        @CacheEvict(value = "popularBrackets", allEntries = true)
    })
    @Transactional
    public Bracket createBracket(String name, String description, String type, String createdBy) {
        String cleanName = Sanitizer.stripToPlain(name, 100);
        String cleanDescription = Sanitizer.sanitizeDescription(description, 2000);
        if (cleanName == null || cleanName.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        if (!type.matches("^(song|video|image)$")) {
            throw new IllegalArgumentException("Invalid type. Must be: song, video, or image");
        }
        Bracket bracket = new Bracket(cleanName, cleanDescription, type, createdBy);
        return bracketRepository.save(bracket);
    }

    @Caching(evict = {
        @CacheEvict(value = "brackets", allEntries = true),
        @CacheEvict(value = "popularBrackets", allEntries = true),
        @CacheEvict(value = "userBrackets", key = "'creator:' + #createdBy")
    })
    @Transactional
    public Bracket createBracket(String name, String description, String type, String category, String createdBy) {
        String cleanName = Sanitizer.stripToPlain(name, 100);
        String cleanDescription = Sanitizer.sanitizeDescription(description, 2000);
        String cleanCategory = category != null ? Sanitizer.stripToPlain(category, 100) : "General";
        if (cleanName == null || cleanName.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        if (!type.matches("^(song|video|image)$")) {
            throw new IllegalArgumentException("Invalid type. Must be: song, video, or image");
        }
        if (cleanCategory == null || cleanCategory.isBlank()) {
            cleanCategory = "General";
        }
        Bracket bracket = new Bracket(cleanName, cleanDescription, type, createdBy);
        bracket.setCategory(cleanCategory);
        return bracketRepository.save(bracket);
    }

    @Caching(evict = {
            @CacheEvict(value = "bracketItems", key = "#bracketId"),
            @CacheEvict(value = "bracket", key = "#bracketId"),
            @CacheEvict(value = "brackets", allEntries = true),
            @CacheEvict(value = "popularBrackets", allEntries = true)
        })
        @Transactional
        public Item addItemToBracket(Long bracketId, String userId, String title, String mediaUrl, String mediaType) {
            // Ensure bracket exists and verify ownership
            Bracket bracket = bracketRepository.findById(bracketId)
                    .orElseThrow(() -> new IllegalArgumentException("Bracket not found"));

            // Verify that the user owns this bracket
            if (bracket.getCreatedBy() == null || !bracket.getCreatedBy().equals(userId)) {
                throw new IllegalArgumentException("You do not have permission to add items to this bracket");
            }

            // Check if bracket has reached maximum items
            List<Item> existingItems = itemRepository.findByBracketId(bracketId);
            if (existingItems.size() >= MAX_ITEMS_PER_BRACKET) {
                throw new IllegalArgumentException("Bracket has reached maximum of " + MAX_ITEMS_PER_BRACKET + " items");
            }

            String cleanTitle = Sanitizer.stripToPlain(title, 150);
            String cleanUrl = mediaUrl != null ? mediaUrl.trim() : null;

            if (cleanTitle == null || cleanTitle.isBlank()) {
                throw new IllegalArgumentException("Title is required");
            }
            if (cleanUrl == null || cleanUrl.length() > 2000 || !Sanitizer.isSafeHttpUrl(cleanUrl)) {
                throw new IllegalArgumentException("Invalid media URL");
            }

            // Additional SSRF protection - block private IP ranges
            if (isPotentiallyDangerousUrl(cleanUrl)) {
                throw new IllegalArgumentException("URL points to restricted resource");
            }

            if (!mediaType.matches("^(song|video|image)$")) {
                throw new IllegalArgumentException("Invalid media type. Must be: song, video, or image");
            }

            Item item = new Item(bracketId, cleanTitle, cleanUrl, mediaType);
            return itemRepository.save(item);
        }

        /**
         * Bulk add multiple items to a bracket in a single transaction.
         * This is much more efficient than calling addItemToBracket() multiple times.
         *
         * @param bracketId The bracket to add items to
         * @param userId The user adding the items (must be bracket owner)
         * @param itemsData List of items to add (title, mediaUrl, mediaType)
         * @return List of created items
         * @throws IllegalArgumentException if validation fails
         */
        @Caching(evict = {
                @CacheEvict(value = "bracketItems", key = "#bracketId"),
                @CacheEvict(value = "bracket", key = "#bracketId"),
                @CacheEvict(value = "brackets", allEntries = true),
                @CacheEvict(value = "popularBrackets", allEntries = true)
            })
        @Transactional
        public List<Item> bulkAddItemsToBracket(Long bracketId, String userId, List<ItemData> itemsData) {
            // Ensure bracket exists and verify ownership
            Bracket bracket = bracketRepository.findById(bracketId)
                    .orElseThrow(() -> new IllegalArgumentException("Bracket not found"));

            // Verify that the user owns this bracket
            if (bracket.getCreatedBy() == null || !bracket.getCreatedBy().equals(userId)) {
                throw new IllegalArgumentException("You do not have permission to add items to this bracket");
            }

            // Check if adding these items would exceed maximum
            List<Item> existingItems = itemRepository.findByBracketId(bracketId);
            int totalItemsAfterAdd = existingItems.size() + itemsData.size();
            if (totalItemsAfterAdd > MAX_ITEMS_PER_BRACKET) {
                throw new IllegalArgumentException(
                    "Cannot add " + itemsData.size() + " items. Bracket currently has " +
                    existingItems.size() + " items. Maximum is " + MAX_ITEMS_PER_BRACKET + "."
                );
            }

            // Validate and create all items
            List<Item> newItems = new java.util.ArrayList<>();
            for (int i = 0; i < itemsData.size(); i++) {
                ItemData data = itemsData.get(i);

                String cleanTitle = Sanitizer.stripToPlain(data.title, 150);
                String cleanUrl = data.mediaUrl != null ? data.mediaUrl.trim() : null;

                if (cleanTitle == null || cleanTitle.isBlank()) {
                    throw new IllegalArgumentException("Title is required for item at index " + i);
                }
                if (cleanUrl == null || cleanUrl.length() > 2000 || !Sanitizer.isSafeHttpUrl(cleanUrl)) {
                    throw new IllegalArgumentException("Invalid media URL for item at index " + i + ": " + data.title);
                }

                // Additional SSRF protection - block private IP ranges
                if (isPotentiallyDangerousUrl(cleanUrl)) {
                    throw new IllegalArgumentException("URL points to restricted resource for item at index " + i + ": " + data.title);
                }

                if (!data.mediaType.matches("^(song|video|image)$")) {
                    throw new IllegalArgumentException("Invalid media type for item at index " + i + ": " + data.title + ". Must be: song, video, or image");
                }

                Item item = new Item(bracketId, cleanTitle, cleanUrl, data.mediaType);
                newItems.add(item);
            }

            // Save all items in a single batch operation
            return itemRepository.saveAll(newItems);
        }

        /**
         * Simple data class to hold item information for bulk creation
         */
        public static class ItemData {
            public final String title;
            public final String mediaUrl;
            public final String mediaType;

            public ItemData(String title, String mediaUrl, String mediaType) {
                this.title = title;
                this.mediaUrl = mediaUrl;
                this.mediaType = mediaType;
            }
        }

        /**
         * Check if URL might be targeting internal/private networks (SSRF protection)
         */
        /**
         * Enhanced SSRF protection that validates URLs against multiple security threats:
         * - Private IP ranges (IPv4 and IPv6)
         * - Localhost variants
         * - Cloud metadata endpoints (AWS, Azure, GCP)
         * - Link-local addresses
         * - DNS resolution timeout to prevent DNS-based DoS
         *
         * @param url The URL to validate
         * @return true if the URL is potentially dangerous, false if it appears safe
         */
        private boolean isPotentiallyDangerousUrl(String url) {
            try {
                java.net.URI uri = new java.net.URI(url);
                String host = uri.getHost();

                if (host == null) {
                    logger.warn("SSRF Protection: Blocked URL with null host: {}", url);
                    return true;
                }

                // Block localhost and common local hostnames
                if (host.equalsIgnoreCase("localhost") ||
                    host.equalsIgnoreCase("local") ||
                    host.equals("127.0.0.1") ||
                    host.equals("::1") ||
                    host.equals("0:0:0:0:0:0:0:1") ||
                    host.equalsIgnoreCase("0.0.0.0") ||
                    host.equals("::") ||
                    host.equals("0:0:0:0:0:0:0:0")) {
                    logger.warn("SSRF Protection: Blocked localhost/loopback: {}", host);
                    return true;
                }

                // Block cloud metadata endpoints (AWS, Azure, GCP, Oracle Cloud)
                if (isCloudMetadataEndpoint(host)) {
                    logger.warn("SSRF Protection: Blocked cloud metadata endpoint: {}", host);
                    return true;
                }

                // Try to resolve the hostname to IP address with timeout
                java.net.InetAddress addr = resolveHostWithTimeout(host, 2000); // 2 second timeout

                // Block private IP ranges using Java's built-in methods
                if (addr.isLoopbackAddress() ||
                    addr.isLinkLocalAddress() ||
                    addr.isSiteLocalAddress() ||
                    addr.isAnyLocalAddress()) {
                    logger.warn("SSRF Protection: Blocked private/local IP: {}", addr.getHostAddress());
                    return true;
                }

                // Additional checks for IPv4 and IPv6 private ranges
                if (isPrivateOrInternalAddress(addr)) {
                    logger.warn("SSRF Protection: Blocked private/internal address: {}", addr.getHostAddress());
                    return true;
                }

                return false;
            } catch (java.net.UnknownHostException e) {
                // Could be a typo or DNS timeout - block it
                logger.warn("SSRF Protection: Failed to resolve host (possible DNS issue): {}", url);
                return true;
            } catch (java.util.concurrent.TimeoutException e) {
                // DNS resolution timeout - potential DNS-based DoS
                logger.warn("SSRF Protection: DNS resolution timeout for: {}", url);
                return true;
            } catch (Exception e) {
                // If we can't validate it properly, block it
                logger.warn("SSRF Protection: Failed to validate URL: {}", url, e);
                return true;
            }
        }

        /**
         * Check if the host is a cloud metadata endpoint.
         * These endpoints expose sensitive instance metadata and credentials.
         */
        private boolean isCloudMetadataEndpoint(String host) {
            return host.equals("169.254.169.254") ||        // AWS, Azure, GCP, Oracle Cloud
                   host.equals("metadata.google.internal") || // GCP alternative
                   host.equals("169.254.170.2") ||           // AWS ECS task metadata
                   host.startsWith("fd00:ec2::") ||          // AWS IPv6 metadata
                   host.equals("100.100.100.200");           // Alibaba Cloud metadata
        }

        /**
         * Resolve hostname to IP address with a timeout to prevent DNS-based DoS attacks.
         */
        private java.net.InetAddress resolveHostWithTimeout(String host, long timeoutMs)
                throws java.net.UnknownHostException, java.util.concurrent.TimeoutException {
            java.util.concurrent.FutureTask<java.net.InetAddress> task =
                new java.util.concurrent.FutureTask<>(() -> java.net.InetAddress.getByName(host));

            Thread thread = new Thread(task);
            thread.setDaemon(true);
            thread.start();

            try {
                return task.get(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (java.util.concurrent.TimeoutException e) {
                thread.interrupt();
                throw e;
            } catch (java.util.concurrent.ExecutionException e) {
                Throwable cause = e.getCause();
                if (cause instanceof java.net.UnknownHostException) {
                    throw (java.net.UnknownHostException) cause;
                }
                throw new RuntimeException("DNS resolution failed", cause);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("DNS resolution interrupted", e);
            }
        }

        /**
         * Comprehensive check for private and internal IP addresses (IPv4 and IPv6).
         * Covers ranges not caught by Java's built-in methods.
         */
        private boolean isPrivateOrInternalAddress(java.net.InetAddress addr) {
            byte[] bytes = addr.getAddress();

            if (bytes.length == 4) {
                // IPv4 checks
                return isPrivateIPv4(bytes);
            } else if (bytes.length == 16) {
                // IPv6 checks
                return isPrivateIPv6(bytes);
            }

            return false;
        }

        /**
         * Check for private IPv4 address ranges:
         * - 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
         * - 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
         * - 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
         * - 169.254.0.0/16 (link-local, includes cloud metadata)
         * - 127.0.0.0/8 (loopback)
         * - 0.0.0.0/8 (current network)
         */
        private boolean isPrivateIPv4(byte[] bytes) {
            int first = bytes[0] & 0xFF;
            int second = bytes[1] & 0xFF;

            // 10.0.0.0/8
            if (first == 10) {
                return true;
            }

            // 172.16.0.0/12 (172.16-31.x.x)
            if (first == 172 && second >= 16 && second <= 31) {
                return true;
            }

            // 192.168.0.0/16
            if (first == 192 && second == 168) {
                return true;
            }

            // 169.254.0.0/16 (link-local, includes cloud metadata endpoints)
            if (first == 169 && second == 254) {
                return true;
            }

            // 127.0.0.0/8 (loopback)
            if (first == 127) {
                return true;
            }

            // 0.0.0.0/8 (current network)
            if (first == 0) {
                return true;
            }

            return false;
        }

        /**
         * Check for private IPv6 address ranges:
         * - fc00::/7 (Unique Local Addresses - private)
         * - fe80::/10 (Link-local addresses)
         * - ::1/128 (loopback)
         * - ::/128 (unspecified)
         * - ff00::/8 (multicast)
         */
        private boolean isPrivateIPv6(byte[] bytes) {
            int firstByte = bytes[0] & 0xFF;

            // fc00::/7 - Unique Local Addresses (private)
            // Checks for fc00:: through fdff::
            if ((firstByte & 0xFE) == 0xFC) {
                return true;
            }

            // fe80::/10 - Link-local addresses
            // First byte is 0xFE, second byte's top 2 bits are 10
            if (firstByte == 0xFE && (bytes[1] & 0xC0) == 0x80) {
                return true;
            }

            // ::1 (loopback)
            boolean isLoopback = true;
            for (int i = 0; i < 15; i++) {
                if (bytes[i] != 0) {
                    isLoopback = false;
                    break;
                }
            }
            if (isLoopback && bytes[15] == 1) {
                return true;
            }

            // :: (unspecified)
            boolean isUnspecified = true;
            for (byte b : bytes) {
                if (b != 0) {
                    isUnspecified = false;
                    break;
                }
            }
            if (isUnspecified) {
                return true;
            }

            // ff00::/8 - Multicast
            if (firstByte == 0xFF) {
                return true;
            }

            return false;
        }
    // Inner class to help with ranking calculations
    private static class ItemStats {
        private final Item item;
        private int totalScore;
        private int timesRanked;
        private int wins;
        private int totalMatches;

        public ItemStats(Item item) {
            this.item = item;
            this.totalScore = 0;
            this.timesRanked = 0;
            this.wins = 0;
            this.totalMatches = 0;
        }

        public void addScore(int score) {
            this.totalScore += score;
            this.timesRanked++;
        }

        public void addWin() {
            this.wins++;
        }

        public void addMatch() {
            this.totalMatches++;
        }

        public Item getItem() {
            return item;
        }

        public double getAverageScore() {
            return timesRanked > 0 ? (double) totalScore / timesRanked : 0;
        }

        public int getWins() {
            return wins;
        }

        public int getTotalMatches() {
            return totalMatches;
        }

        public int getWinPercentage() {
            return totalMatches > 0 ? (int) Math.round((double) wins / totalMatches * 100) : 0;
        }

        public int getTimesRanked() {
            return timesRanked;
        }
    }
}
