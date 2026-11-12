package com.bracketbattle.repository;

import com.bracketbattle.model.Result;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ResultRepository extends JpaRepository<Result, Long> {

    List<Result> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

    List<Result> findByBracketIdAndUserIdOrderByCreatedAtAscIdAsc(Long bracketId, String userId);

    Optional<Result> findBySubmissionToken(String submissionToken);

    /** Runs that count toward the leaderboard: the bracket's public run count. */
    long countByBracketIdAndCountedTrue(Long bracketId);

    /** The bracket's counted runs, oldest first, for rebuilding its leaderboard. */
    List<Result> findByBracketIdAndCountedTrueOrderByIdAsc(Long bracketId);

    /**
     * Latest public comments. Only counted runs: a run past its daily quota is still the player's
     * own, but it doesn't get to flood the comments either.
     */
    @Query("""
            SELECT r FROM Result r
            WHERE r.bracketId = :bracketId AND r.counted = true
              AND r.comment IS NOT NULL AND TRIM(r.comment) <> ''
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    List<Result> findLatestComments(Long bracketId, Limit limit);

    /** When each bracket with at least one run was last played (sitemap lastmod). */
    @Query("SELECT r.bracketId AS bracketId, MAX(r.createdAt) AS latest FROM Result r GROUP BY r.bracketId")
    List<LatestResult> findLatestResultPerBracket();

    interface LatestResult {
        Long getBracketId();
        Instant getLatest();
    }
}
