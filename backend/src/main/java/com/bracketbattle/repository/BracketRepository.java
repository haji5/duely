package com.bracketbattle.repository;

import com.bracketbattle.model.Bracket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/** Single brackets and their counters. The paged lists are in {@link BracketListRepository}. */
@Repository
public interface BracketRepository extends JpaRepository<Bracket, Long> {

    /** The owner check. Reads the table: cached brackets carry no owner. */
    boolean existsByIdAndCreatedBy(Long id, String createdBy);

    @Query("SELECT b.id FROM Bracket b ORDER BY b.id")
    List<Long> findAllIds();

    /**
     * Adds one counted run, the saved result {@code resultId}, in the transaction that saved it.
     * last_run_at is copied from the row so it equals the run's created_at to the microsecond.
     */
    @Modifying
    @Query(value = """
            UPDATE brackets SET run_count = run_count + 1,
                last_run_at = GREATEST(last_run_at, (SELECT r.created_at FROM results r WHERE r.id = :resultId))
            WHERE id = :id
            """, nativeQuery = true)
    void addCountedRun(long id, long resultId);

    /** Sets the run counters from a recount (StatsService.rebuild). */
    @Modifying
    // The cast types a null lastRunAt (no counted runs left), which Postgres can't infer on its own.
    @Query(value = "UPDATE brackets SET run_count = :runCount, last_run_at = CAST(:lastRunAt AS TIMESTAMP WITH TIME ZONE) WHERE id = :id",
            nativeQuery = true)
    void setRunCounters(long id, long runCount, Instant lastRunAt);
}
