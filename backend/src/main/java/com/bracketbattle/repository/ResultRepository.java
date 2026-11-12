package com.bracketbattle.repository;

import com.bracketbattle.model.Result;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ResultRepository extends JpaRepository<Result, Long> {

    /** A user's latest runs of a bracket, newest first (idx_results_user_bracket_created). */
    List<Result> findByBracketIdAndUserIdOrderByCreatedAtDescIdDesc(Long bracketId, String userId, Limit limit);

    Optional<Result> findBySubmissionToken(String submissionToken);

    /** The bracket's counted runs, oldest first, for rebuilding its leaderboard. */
    List<Result> findByBracketIdAndCountedTrueOrderByIdAsc(Long bracketId);

    /**
     * Latest public comments, read from idx_results_comments. Only counted runs: a run past its
     * daily quota is still the player's own, but it doesn't get to flood the comments either.
     */
    @Query("""
            SELECT r FROM Result r
            WHERE r.bracketId = :bracketId AND r.counted = true AND r.comment IS NOT NULL
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    List<Result> findLatestComments(Long bracketId, Limit limit);
}
