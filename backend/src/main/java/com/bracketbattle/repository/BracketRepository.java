package com.bracketbattle.repository;

import com.bracketbattle.model.Bracket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface BracketRepository extends JpaRepository<Bracket, Long> {

    @Query("SELECT b FROM Bracket b ORDER BY SIZE(b.results) DESC")
    List<Bracket> findPopularBrackets();

    List<Bracket> findByType(String type);
}
