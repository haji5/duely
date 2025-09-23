package com.bracketbattle.service;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

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
        // Basic validation: ensure bracket exists and ranking items belong to it
        Bracket bracket = bracketRepository.findById(bracketId)
                .orElseThrow(() -> new IllegalArgumentException("Bracket not found"));
        if (ranking == null || ranking.isEmpty()) {
            throw new IllegalArgumentException("Ranking must not be empty");
        }
        List<Item> items = itemRepository.findByBracketId(bracketId);
        Set<Long> validItemIds = new HashSet<>();
        for (Item i : items) validItemIds.add(i.getId());
        for (Long itemId : ranking) {
            if (!validItemIds.contains(itemId)) {
                throw new IllegalArgumentException("Ranking contains invalid item for this bracket");
            }
        }
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

    public Bracket createBracket(String name, String description, String type, String createdBy) {
        String cleanName = Sanitizer.stripToPlain(name, 100);
        String cleanDescription = Sanitizer.sanitizeDescription(description, 2000);
        if (cleanName == null || cleanName.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        if (!type.matches("^(song|audio|video|image)$")) {
            throw new IllegalArgumentException("Invalid type");
        }
        Bracket bracket = new Bracket(cleanName, cleanDescription, type, createdBy);
        return bracketRepository.save(bracket);
    }

    public Item addItemToBracket(Long bracketId, String title, String mediaUrl, String mediaType) {
        // Ensure bracket exists
        bracketRepository.findById(bracketId)
                .orElseThrow(() -> new IllegalArgumentException("Bracket not found"));
        String cleanTitle = Sanitizer.stripToPlain(title, 150);
        String cleanUrl = mediaUrl != null ? mediaUrl.trim() : null;
        if (cleanTitle == null || cleanTitle.isBlank()) {
            throw new IllegalArgumentException("Title is required");
        }
        if (cleanUrl == null || !Sanitizer.isSafeHttpUrl(cleanUrl)) {
            throw new IllegalArgumentException("Invalid media URL");
        }
        if (!mediaType.matches("^(song|audio|video|image)$")) {
            throw new IllegalArgumentException("Invalid media type");
        }
        // For videos, restrict to YouTube to avoid arbitrary iframes
        if (("video").equalsIgnoreCase(mediaType) && !Sanitizer.isYouTubeUrl(cleanUrl)) {
            throw new IllegalArgumentException("Only YouTube URLs are allowed for videos");
        }
        Item item = new Item(bracketId, cleanTitle, cleanUrl, mediaType);
        return itemRepository.save(item);
    }
}
