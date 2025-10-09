package com.bracketbattle.controller;

import com.bracketbattle.service.CacheMonitoringService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/admin/cache")
@PreAuthorize("hasRole('ADMIN')")
public class CacheManagementController {

    @Autowired
    private CacheMonitoringService cacheMonitoringService;

    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> getCacheInfo() {
        return ResponseEntity.ok(cacheMonitoringService.getCacheInfo());
    }

    @PostMapping("/clear")
    public ResponseEntity<String> clearAllCaches() {
        cacheMonitoringService.clearAllCaches();
        return ResponseEntity.ok("All caches cleared successfully");
    }

    @PostMapping("/clear/{cacheName}")
    public ResponseEntity<String> clearCache(@PathVariable String cacheName) {
        cacheMonitoringService.clearCache(cacheName);
        return ResponseEntity.ok("Cache '" + cacheName + "' cleared successfully");
    }

    @PostMapping("/evict/{cacheName}/{key}")
    public ResponseEntity<String> evictCacheKey(
            @PathVariable String cacheName,
            @PathVariable String key) {
        cacheMonitoringService.evictCacheKey(cacheName, key);
        return ResponseEntity.ok("Key '" + key + "' evicted from cache '" + cacheName + "'");
    }
}
