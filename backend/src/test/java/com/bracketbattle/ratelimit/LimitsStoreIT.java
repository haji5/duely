package com.bracketbattle.ratelimit;

import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Rate-limit counters live in their own Valkey, which never evicts, so filling the cache's Valkey
 * (which evicts the least recently used keys when full) cannot reset a quota.
 */
@TestPropertySource(properties = "app.rate-limit.buckets.counted-ip.limit=2")
class LimitsStoreIT extends IntegrationTest {

    static final GenericContainer<?> LIMITS = new GenericContainer<>("valkey/valkey:8-alpine")
            .withCommand("valkey-server", "--maxmemory-policy", "noeviction")
            .withExposedPorts(6379);

    static {
        LIMITS.start();
    }

    @DynamicPropertySource
    static void limitsValkey(DynamicPropertyRegistry registry) {
        registry.add("app.rate-limit.valkey.host", LIMITS::getHost);
        registry.add("app.rate-limit.valkey.port", () -> LIMITS.getMappedPort(6379));
    }

    @Autowired
    RateLimitStore limitsStore;

    @BeforeEach
    void emptyTheLimitsStoreAndShrinkTheCache() {
        // The base class flushes only the cache's instance.
        StringRedisTemplate limits = limitsStore.template();
        limits.execute((RedisCallback<Void>) c -> {
            c.serverCommands().flushAll();
            return null;
        });
        config("maxmemory", "8mb");
        config("maxmemory-policy", "allkeys-lru");
    }

    @AfterEach
    void restoreTheCache() {
        // The cache's container is shared by every test in this JVM.
        config("maxmemory", "0");
        config("maxmemory-policy", "noeviction");
    }

    @Test
    void fillingTheCacheDoesNotResetTheDailyQuota() throws Exception {
        long target = createBracket(USER_A, "Target", 4).get("id").asLong();
        List<Long> items = itemIds(target);
        for (int i = 0; i < 3; i++) {
            assertThat(submitAsGuest(target, items)).isEqualTo(200);
        }
        assertThat(runCount(target)).isEqualTo(2);
        assertThat(limitsStore.template().keys("ratelimit:counted-ip:" + target + ":*")).hasSize(1);

        long evictedBefore = evictedKeys();
        for (int n = 0; n < 10; n++) {
            long id = body(perform(as(USER_B, postJson("/brackets", fatBracket(n))))).get("id").asLong();
            perform(get("/brackets/" + id + "/items")); // caches about 1.25 MB as bracketItems
        }
        assertThat(evictedKeys()).as("the cache evicted keys").isGreaterThan(evictedBefore);

        assertThat(submitAsGuest(target, items)).isEqualTo(200);
        assertThat(runCount(target)).isEqualTo(2);
        assertThat(limitsStore.template().keys("ratelimit:counted-ip:" + target + ":*")).hasSize(1);
        assertThat(redis.keys("ratelimit:*")).as("counters in the cache's instance").isEmpty();
    }

    private int submitAsGuest(long bracketId, List<Long> ranking) throws Exception {
        return perform(postJson("/brackets/" + bracketId + "/results", runPayload(ranking, null, null)))
                .getResponse().getStatus();
    }

    private long runCount(long bracketId) throws Exception {
        return body(perform(get("/brackets/" + bracketId + "/stats"))).get("runCount").asLong();
    }

    /** A bracket whose cached item list is about 1.25 MB: 500 entries with 2000-character URLs. */
    private static Map<String, Object> fatBracket(int n) {
        String title = "x".repeat(150);
        String prefix = "https://images.example.com/";
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            String tail = n + "-" + i + "-";
            items.add(Map.of("title", title, "mediaUrl", prefix + tail + "a".repeat(2000 - prefix.length() - tail.length())));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", "Fat " + n);
        payload.put("description", "d".repeat(2000));
        payload.put("type", "image");
        payload.put("category", "Technology");
        payload.put("items", items);
        return payload;
    }

    private void config(String key, String value) {
        redis.execute((RedisCallback<Void>) c -> {
            c.serverCommands().setConfig(key, value);
            return null;
        });
    }

    private long evictedKeys() {
        Properties info = redis.execute((RedisCallback<Properties>) c -> c.serverCommands().info("stats"));
        return Long.parseLong(info.getProperty("evicted_keys"));
    }
}
