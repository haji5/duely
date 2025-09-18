package com.bracketbattle.service;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ResultRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class BracketService {

    @Autowired
    private BracketRepository bracketRepository;

    @Autowired
    private ItemRepository itemRepository;

    @Autowired
    private ResultRepository resultRepository;

    public List<Bracket> getAllBrackets() {
        return bracketRepository.findAll();
    }

    public Optional<Bracket> getBracketById(Long id) {
        return bracketRepository.findById(id);
    }

    public List<Bracket> getPopularBrackets() {
        return bracketRepository.findPopularBrackets();
    }

    public List<Item> getBracketItems(Long bracketId) {
        return itemRepository.findByBracketId(bracketId);
    }

    public Result saveBracketResult(Long bracketId, String userId, List<Long> ranking) {
        Result result = new Result(bracketId, userId, ranking);
        return resultRepository.save(result);
    }

    public List<Result> getBracketResults(Long bracketId) {
        return resultRepository.findByBracketIdOrderByCreatedAtDesc(bracketId);
    }

    public List<Result> getUserResults(String userId) {
        return resultRepository.findByUserId(userId);
    }

    public List<Result> getUserBracketResults(Long bracketId, String userId) {
        return resultRepository.findByBracketIdAndUserId(bracketId, userId);
    }

    public Bracket createBracket(String name, String description, String type) {
        Bracket bracket = new Bracket(name, description, type);
        return bracketRepository.save(bracket);
    }

    public Item addItemToBracket(Long bracketId, String title, String mediaUrl, String mediaType) {
        Item item = new Item(bracketId, title, mediaUrl, mediaType);
        return itemRepository.save(item);
    }
}
