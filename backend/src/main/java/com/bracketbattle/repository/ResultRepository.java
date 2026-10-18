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

    List<Result> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

    List<Result> findByBracketIdAndUserIdOrderByCreatedAtAscIdAsc(Long bracketId, String userId);

    Optional<Result> findBySubmissionToken(String submissionToken);

    @Query("""
            SELECT r FROM Result r
            WHERE r.bracketId = :bracketId AND r.comment IS NOT NULL AND TRIM(r.comment) <> ''
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    List<Result> findLatestComments(Long bracketId, Limit limit);
}
