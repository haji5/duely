package com.bracketbattle.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.stereotype.Component;

/**
 * Custom cache error handler to prevent application failures when Valkey is unavailable.
 * This allows the application to continue functioning without cache, logging errors instead of throwing.
 */
@Component
public class RedisCacheErrorHandler implements CacheErrorHandler {

    private static final Logger logger = LoggerFactory.getLogger(RedisCacheErrorHandler.class);

    @Override
    public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
        logger.error("Failed to get cache entry from cache '{}' with key '{}': {}",
            cache.getName(), key, exception.getMessage());
        // Swallow the exception - application continues without cache
    }

    @Override
    public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
        logger.error("Failed to put cache entry to cache '{}' with key '{}': {}",
            cache.getName(), key, exception.getMessage());
        // Swallow the exception - application continues without cache
    }

    @Override
    public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
        logger.error("Failed to evict cache entry from cache '{}' with key '{}': {}",
            cache.getName(), key, exception.getMessage());
        // Swallow the exception - application continues without cache
    }

    @Override
    public void handleCacheClearError(RuntimeException exception, Cache cache) {
        logger.error("Failed to clear cache '{}': {}",
            cache.getName(), exception.getMessage());
        // Swallow the exception - application continues without cache
    }
}
