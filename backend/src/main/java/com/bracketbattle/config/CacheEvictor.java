package com.bracketbattle.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.util.Collection;

/**
 * Evictions for writes whose keys are only known at run time (moderation, account deletion,
 * rebuilds), where {@code @CacheEvict} cannot express them. Call after the transaction commits,
 * so a reader cannot cache the old rows again in between. While Valkey is down an eviction is
 * logged and skipped: the TTLs in {@link CacheConfig#CACHES} bound how long old values are served.
 */
@Component
public class CacheEvictor {

    private static final Logger log = LoggerFactory.getLogger(CacheEvictor.class);

    private final CacheManager cacheManager;

    public CacheEvictor(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    public void evict(String cacheName, Object key) {
        Cache cache = cache(cacheName); // outside the try: an unknown name is a bug, not an outage
        try {
            cache.evict(key);
        } catch (RuntimeException e) {
            log.warn("Could not evict {} {}: {}", cacheName, key, e.getMessage());
        }
    }

    public void evictAll(String cacheName, Collection<?> keys) {
        keys.forEach(key -> evict(cacheName, key));
    }

    /** Drops every entry of a cache. */
    public void clear(String cacheName) {
        Cache cache = cache(cacheName);
        try {
            cache.clear();
        } catch (RuntimeException e) {
            log.warn("Could not clear {}: {}", cacheName, e.getMessage());
        }
    }

    /** Everything cached about one bracket, for when it changes visibility or is deleted. */
    public void evictBracket(long bracketId) {
        clearLists();
        for (String name : new String[]{"bracket", "bracketItems", "bracketRankings", "bracketComments"}) {
            evict(name, bracketId);
        }
    }

    /** A user's cached run history on each of these brackets. */
    public void evictUserResults(String userId, Collection<Long> bracketIds) {
        bracketIds.forEach(bracketId -> evict("userResults", userId + ":" + bracketId));
    }

    /** The cached list pages and the home page, which any bracket appearing or going can change. */
    public void clearLists() {
        clear("bracketPages");
        clear("home");
    }

    private Cache cache(String name) {
        Cache cache = cacheManager.getCache(name);
        if (cache == null) {
            throw new IllegalStateException("Unknown cache '" + name + "'");
        }
        return cache;
    }
}
