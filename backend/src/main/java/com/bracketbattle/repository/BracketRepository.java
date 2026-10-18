package com.bracketbattle.repository;

import com.bracketbattle.model.Bracket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BracketRepository extends JpaRepository<Bracket, Long> {

    /** Playable brackets (at least two items), newest first. Hides legacy empty brackets. */
    @Query(value = """
            SELECT b.* FROM brackets b
            WHERE (SELECT COUNT(*) FROM items i WHERE i.bracket_id = b.id) >= 2
            ORDER BY b.created_at DESC, b.id DESC
            """, nativeQuery = true)
    List<Bracket> findPlayable();

    /** Playable brackets ordered by how many runs they have, most played first. */
    @Query(value = """
            SELECT b.* FROM brackets b
            WHERE (SELECT COUNT(*) FROM items i WHERE i.bracket_id = b.id) >= 2
            ORDER BY (SELECT COUNT(*) FROM results r WHERE r.bracket_id = b.id) DESC,
                     b.created_at DESC, b.id DESC
            """, nativeQuery = true)
    List<Bracket> findPopular();

    List<Bracket> findByCreatedByOrderByCreatedAtDescIdDesc(String createdBy);
}
