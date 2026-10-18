package com.bracketbattle.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Treats cache failures (Valkey down, unreadable entry) as cache misses so requests are still
 * served from the database. Warnings are throttled to one a minute so an outage doesn't flood logs.
 */
@Component
public class RedisCacheErrorHandler implements CacheErrorHandler {

    private static final Logger logger = LoggerFactory.getLogger(RedisCacheErrorHandler.class);
    private static final long WARN_INTERVAL_MS = 60_000;

    private final AtomicLong lastWarning = new AtomicLong();

    @Override
    public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
        warn("read", cache, exception);
    }

    @Override
    public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
        warn("write", cache, exception);
    }

    @Override
    public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
        // An eviction that didn't happen can leave stale data until the entry's TTL; always log it.
        logger.warn("Failed to evict key '{}' from cache '{}': {}", key, cache.getName(), exception.getMessage());
    }

    @Override
    public void handleCacheClearError(RuntimeException exception, Cache cache) {
        logger.warn("Failed to clear cache '{}': {}", cache.getName(), exception.getMessage());
    }

    private void warn(String operation, Cache cache, RuntimeException exception) {
        long now = System.currentTimeMillis();
        long last = lastWarning.get();
        if (now - last > WARN_INTERVAL_MS && lastWarning.compareAndSet(last, now)) {
            logger.warn("Cache {} failed for '{}', serving from the database: {}",
                    operation, cache.getName(), exception.getMessage());
        }
    }
}
