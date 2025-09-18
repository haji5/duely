package com.bracketbattle.repository;

import com.bracketbattle.model.Item;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ItemRepository extends JpaRepository<Item, Long> {

    List<Item> findByBracketId(Long bracketId);

    List<Item> findByBracketIdAndMediaType(Long bracketId, String mediaType);
}
