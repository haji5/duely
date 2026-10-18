package com.bracketbattle.controller;

import com.bracketbattle.config.CacheConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-only cache clearing, e.g. after editing data directly in the database. */
@RestController
@RequestMapping("/admin/cache")
@PreAuthorize("hasRole('ADMIN')")
public class CacheManagementController {

    private static final Logger log = LoggerFactory.getLogger(CacheManagementController.class);

    private final CacheManager cacheManager;

    public CacheManagementController(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @PostMapping("/clear")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearAllCaches() {
        CacheConfig.CACHES.keySet().forEach(this::clear);
        log.info("Cleared all caches");
    }

    @PostMapping("/clear/{cacheName}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearCache(@PathVariable String cacheName) {
        if (!CacheConfig.CACHES.containsKey(cacheName)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown cache '" + cacheName + "'");
        }
        clear(cacheName);
        log.info("Cleared cache {}", cacheName);
    }

    private void clear(String name) {
        Cache cache = cacheManager.getCache(name);
        if (cache != null) {
            cache.clear();
        }
    }
}
