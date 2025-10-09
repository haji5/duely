package com.bracketbattle.repository;

import com.bracketbattle.model.Result;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ResultRepository extends JpaRepository<Result, Long> {

    List<Result> findByBracketId(Long bracketId);

    List<Result> findByUserId(String userId);

    List<Result> findByBracketIdAndUserId(Long bracketId, String userId);

    List<Result> findByBracketIdOrderByCreatedAtDesc(Long bracketId);

    Optional<Result> findBySubmissionToken(String submissionToken);

    boolean existsBySubmissionToken(String submissionToken);
}
