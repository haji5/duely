package com.bracketbattle.service;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

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

    @Cacheable(value = "brackets", unless = "#result == null || #result.isEmpty()")
    public List<Bracket> getAllBrackets() {
        return bracketRepository.findAll();
    }

    @Cacheable(value = "bracket", key = "#id", unless = "#result == null")
    public Optional<Bracket> getBracketById(Long id) {
        return bracketRepository.findById(id);
    }

    @Cacheable(value = "popularBrackets", unless = "#result == null || #result.isEmpty()")
    public List<Bracket> getPopularBrackets() {
        return bracketRepository.findPopularBrackets();
    }

    @Cacheable(value = "bracketItems", key = "#bracketId", unless = "#result == null || #result.isEmpty()")
    public List<Item> getBracketItems(Long bracketId) {
        return itemRepository.findByBracketId(bracketId);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    @CacheEvict(value = {"bracketResults", "userResults", "popularBrackets"}, allEntries = true)
    public Result saveBracketResult(Long bracketId, String userId, List<Long> ranking, String submissionToken) {
        // Check for idempotency - if this submission token already exists, return the existing result
        Optional<Result> existingResult = resultRepository.findBySubmissionToken(submissionToken);
        if (existingResult.isPresent()) {
            // This is a duplicate submission (e.g., from double-clicking), return the existing result
            return existingResult.get();
        }

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

        // Create result with submission token
        Result result = new Result(bracketId, userId, ranking, submissionToken);

        try {
            return resultRepository.save(result);
        } catch (DataIntegrityViolationException e) {
            // If there's a unique constraint violation on submission_token,
            // it means another thread saved it first - fetch and return that result
            return resultRepository.findBySubmissionToken(submissionToken)
                    .orElseThrow(() -> new IllegalStateException("Concurrent submission failed"));
        }
    }

    @Cacheable(value = "bracketResults", key = "#bracketId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getBracketResults(Long bracketId) {
        return resultRepository.findByBracketIdOrderByCreatedAtDesc(bracketId);
    }

    @Cacheable(value = "userResults", key = "#userId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getUserResults(String userId) {
        return resultRepository.findByUserId(userId);
    }

    @Cacheable(value = "userResults", key = "#bracketId + '-' + #userId", unless = "#result == null || #result.isEmpty()")
    public List<Result> getUserBracketResults(Long bracketId, String userId) {
        return resultRepository.findByBracketIdAndUserId(bracketId, userId);
    }

    @CacheEvict(value = {"brackets", "popularBrackets"}, allEntries = true)
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

    @CacheEvict(value = {"brackets", "popularBrackets"}, allEntries = true)
    public Bracket createBracket(String name, String description, String type, String category, String createdBy) {
        String cleanName = Sanitizer.stripToPlain(name, 100);
        String cleanDescription = Sanitizer.sanitizeDescription(description, 2000);
        String cleanCategory = category != null ? Sanitizer.stripToPlain(category, 100) : "General";
        if (cleanName == null || cleanName.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        if (!type.matches("^(song|audio|video|image)$")) {
            throw new IllegalArgumentException("Invalid type");
        }
        if (cleanCategory == null || cleanCategory.isBlank()) {
            cleanCategory = "General";
        }
        Bracket bracket = new Bracket(cleanName, cleanDescription, type, createdBy);
        bracket.setCategory(cleanCategory);
        return bracketRepository.save(bracket);
    }

    @CacheEvict(value = {"bracketItems", "bracket"}, allEntries = true)
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
