package com.bracketbattle.service;

import com.bracketbattle.config.CacheEvictor;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.repository.ResultRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Rebuilds item_stats and the bracket's run counters from the counted results, with the same Java
 * scoring as live submissions: on demand (admin endpoint, and after a run is removed) and on
 * startup whenever
 * {@link #STATS_VERSION} is newer than the version recorded in app_meta, so a scoring change
 * reaches history on deploy.
 */
@Service
public class StatsService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StatsService.class);

    /** 1: list-position scores. 2: tier scores derived from the matches. */
    static final int STATS_VERSION = 2;
    static final String VERSION_KEY = "stats_version";

    private final BracketRepository bracketRepository;
    private final ItemRepository itemRepository;
    private final ResultRepository resultRepository;
    private final ItemStatsRepository itemStatsRepository;
    private final TransactionTemplate transactionTemplate;
    private final JdbcTemplate jdbc;
    private final CacheEvictor caches;

    public StatsService(BracketRepository bracketRepository, ItemRepository itemRepository,
                        ResultRepository resultRepository, ItemStatsRepository itemStatsRepository,
                        TransactionTemplate transactionTemplate, JdbcTemplate jdbc, CacheEvictor caches) {
        this.bracketRepository = bracketRepository;
        this.itemRepository = itemRepository;
        this.resultRepository = resultRepository;
        this.itemStatsRepository = itemStatsRepository;
        this.transactionTemplate = transactionTemplate;
        this.jdbc = jdbc;
        this.caches = caches;
    }

    /** Recomputes one bracket's rows and run count in one transaction, then drops what is cached of them. */
    public void rebuild(long bracketId) {
        rebuild(bracketId, () -> {});
    }

    /**
     * Makes {@code change} to the bracket's runs (deleting one, say) and recomputes its rows in the
     * same transaction, under the exclusive stats lock: no submission interleaves, and nobody sees
     * the change without the leaderboard that goes with it.
     */
    public void rebuild(long bracketId, Runnable change) {
        transactionTemplate.executeWithoutResult(status -> {
            itemStatsRepository.lockExclusively(bracketId);
            change.run();
            Set<Long> items = new HashSet<>(itemRepository.findIdsByBracketId(bracketId));
            Map<Long, ItemStatsRepository.Totals> totals = new TreeMap<>();
            List<Result> runs = resultRepository.findByBracketIdAndCountedTrueOrderByIdAsc(bracketId);
            Instant lastRun = null;
            // Oldest first: the order the incremental upserts added them in, so the floating-point
            // sums come out identical.
            for (Result run : runs) {
                ItemStatsRepository.deltas(run.scored(), run.getMatches()).forEach((itemId, delta) -> {
                    if (items.contains(itemId)) {
                        totals.put(itemId, totals.getOrDefault(itemId, ItemStatsRepository.Totals.EMPTY).plus(delta));
                    }
                });
                if (run.getCreatedAt() != null && (lastRun == null || run.getCreatedAt().isAfter(lastRun))) {
                    lastRun = run.getCreatedAt();
                }
            }
            itemStatsRepository.replaceAll(bracketId, totals);
            bracketRepository.setRunCounters(bracketId, runs.size(), lastRun);
        });
        caches.evict("bracketRankings", bracketId);
        caches.evict("bracket", bracketId);
    }

    /** Applies a new scoring version to every bracket. Each bracket is its own transaction. */
    @Override
    public void run(ApplicationArguments args) {
        int stored = storedVersion();
        if (stored >= STATS_VERSION) return;
        List<Long> ids = bracketRepository.findAllIds();
        log.info("Leaderboard scoring changed (version {} -> {}): rebuilding {} brackets", stored, STATS_VERSION, ids.size());
        ids.forEach(this::rebuild);
        jdbc.update("""
                INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)
                ON CONFLICT (meta_key) DO UPDATE SET meta_value = EXCLUDED.meta_value
                """, VERSION_KEY, Integer.toString(STATS_VERSION));
        log.info("Leaderboards rebuilt");
    }

    int storedVersion() {
        List<String> values = jdbc.queryForList("SELECT meta_value FROM app_meta WHERE meta_key = ?", String.class, VERSION_KEY);
        return values.isEmpty() ? 0 : Integer.parseInt(values.get(0));
    }
}
