package com.bracketbattle.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Deletes guests' runs that did not count, once their ticket can no longer be replayed. Such a run
 * is in no leaderboard, counter, comment list or history (a guest has none on the server), so it
 * only takes up space; it is kept until then only because its ticket nonce is what makes a retry
 * return the original run instead of saving a new one. Past {@link RunTickets#MAX_AGE} the ticket
 * check rejects the retry anyway, so removing the row cannot turn one into a new, countable run.
 * Signed-in players' uncounted runs stay: they are the player's own history.
 *
 * <p>Nothing is cached about these runs and no stats depend on them, so there is nothing to
 * rebuild or evict. Several instances may sweep at once; the deletes simply find less to do.
 */
@Service
public class RunPruner {

    private static final Logger log = LoggerFactory.getLogger(RunPruner.class);

    /** How long after its ticket was issued at the latest a run may still be resubmitted, plus a margin. */
    static final Duration KEEP = RunTickets.MAX_AGE.plus(Duration.ofHours(1));
    /** Rows per statement; each statement is its own short transaction. */
    static final int BATCH = 5000;

    // The predicate is repeated literally from idx_results_uncounted_guest (changeset 17) so the
    // planner can match the partial index.
    private static final String DELETE_BATCH = """
            DELETE FROM results WHERE id IN (
                SELECT id FROM results
                WHERE counted = false AND user_id IS NULL
                  AND created_at < now() - make_interval(secs => ?)
                LIMIT ?)
            """;

    private final JdbcTemplate jdbc;
    private final Counter pruned;

    public RunPruner(JdbcTemplate jdbc, MeterRegistry meters) {
        this.jdbc = jdbc;
        this.pruned = Counter.builder("duely.runs.pruned")
                .description("Uncounted guest runs deleted once their ticket expired")
                .register(meters);
    }

    /** Runs on {@code app.runs.prune-cron}; returns how many runs were deleted. */
    @Scheduled(cron = "${app.runs.prune-cron:0 15 * * * *}")
    public long prune() {
        long total = 0;
        int deleted;
        do {
            deleted = jdbc.update(DELETE_BATCH, KEEP.toSeconds(), BATCH);
            total += deleted;
            pruned.increment(deleted);
        } while (deleted == BATCH);
        if (total > 0) {
            log.info("Pruned {} uncounted guest runs older than {}", total, KEEP);
        }
        return total;
    }
}
