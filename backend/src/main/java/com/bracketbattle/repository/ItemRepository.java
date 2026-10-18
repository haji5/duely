package com.bracketbattle.repository;

import com.bracketbattle.model.Item;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ItemRepository extends JpaRepository<Item, Long> {

    List<Item> findByBracketIdOrderByIdAsc(Long bracketId);

    @Query("SELECT i.id FROM Item i WHERE i.bracketId = :bracketId")
    List<Long> findIdsByBracketId(Long bracketId);
}
