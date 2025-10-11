package com.bracketbattle.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class CacheMonitoringService {

    private static final Logger logger = LoggerFactory.getLogger(CacheMonitoringService.class);
    private final CacheManager cacheManager;

    public CacheMonitoringService(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    /**
     * Get information about all caches
     */
    public Map<String, Object> getCacheInfo() {
        Map<String, Object> cacheInfo = new HashMap<>();

        for (String cacheName : cacheManager.getCacheNames()) {
            Cache cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                try {
                    Map<String, Object> info = new HashMap<>();
                    info.put("name", cacheName);
                    info.put("nativeCache", cache.getNativeCache().getClass().getSimpleName());

                    // Try to get Redis-specific info if available
                    Object nativeCache = cache.getNativeCache();
                    if (nativeCache instanceof org.springframework.data.redis.cache.RedisCache) {
                        info.put("type", "Redis");
                    }

                    cacheInfo.put(cacheName, info);
                } catch (Exception e) {
                    logger.warn("Failed to get info for cache '{}': {}", cacheName, e.getMessage());
                    Map<String, Object> errorInfo = new HashMap<>();
                    errorInfo.put("name", cacheName);
                    errorInfo.put("error", e.getMessage());
                    cacheInfo.put(cacheName, errorInfo);
                }
            }
        }

        return cacheInfo;
    }

    /**
     * Clear all caches
     */
    public void clearAllCaches() {
        logger.info("Clearing all caches");
        for (String cacheName : cacheManager.getCacheNames()) {
            Cache cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.clear();
                logger.info("Cleared cache: {}", cacheName);
            }
        }
    }

    /**
     * Clear a specific cache
     */
    public void clearCache(String cacheName) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.clear();
            logger.info("Cleared cache: {}", cacheName);
        } else {
            logger.warn("Cache not found: {}", cacheName);
        }
    }

    /**
     * Evict a specific key from a cache
     */
    public void evictCacheKey(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.evict(key);
            logger.info("Evicted key '{}' from cache '{}'", key, cacheName);
        } else {
            logger.warn("Cache not found: {}", cacheName);
        }
    }
}
