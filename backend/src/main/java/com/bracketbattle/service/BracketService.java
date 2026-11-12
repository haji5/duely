package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.dto.BracketStatsDto;
import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.media.MediaUrlValidator;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Categories;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BracketService {

    public static final int MAX_ITEMS = 500;
    public static final int MAX_COMMENTS = 50;

    private final BracketRepository bracketRepository;
    private final ItemRepository itemRepository;
    private final ResultRepository resultRepository;
    private final ItemStatsRepository itemStatsRepository;
    private final MediaUrlValidator mediaUrlValidator;
    private final TransactionTemplate transactionTemplate;

    public BracketService(BracketRepository bracketRepository, ItemRepository itemRepository,
                          ResultRepository resultRepository, ItemStatsRepository itemStatsRepository,
                          MediaUrlValidator mediaUrlValidator, TransactionTemplate transactionTemplate) {
        this.bracketRepository = bracketRepository;
        this.itemRepository = itemRepository;
        this.resultRepository = resultRepository;
        this.itemStatsRepository = itemStatsRepository;
        this.mediaUrlValidator = mediaUrlValidator;
        this.transactionTemplate = transactionTemplate;
    }

    // ---- Reads -------------------------------------------------------------------------------

    @Cacheable("brackets")
    public List<Bracket> getAllBrackets() {
        return bracketRepository.findPlayable();
    }

    @Cacheable("popularBrackets")
    public List<Bracket> getPopularBrackets() {
        return bracketRepository.findPopular();
    }

    @Cacheable(value = "bracket", key = "#id", unless = "#result == null")
    public Optional<Bracket> getBracketById(Long id) {
        return bracketRepository.findById(id);
    }

    @Cacheable(value = "bracketItems", key = "#bracketId")
    public List<Item> getBracketItems(Long bracketId) {
        return itemRepository.findByBracketIdOrderByIdAsc(bracketId);
    }

    @Cacheable(value = "bracketRankings", key = "#bracketId")
    public List<ItemRankingDto> getBracketRankings(Long bracketId) {
        return itemStatsRepository.findRankings(bracketId);
    }

    @Cacheable(value = "bracketStats", key = "#bracketId")
    public BracketStatsDto getBracketStats(Long bracketId) {
        return new BracketStatsDto(resultRepository.countByBracketIdAndCountedTrue(bracketId));
    }

    @Cacheable(value = "bracketComments", key = "#bracketId")
    public List<CommentDto> getBracketComments(Long bracketId) {
        return new ArrayList<>(resultRepository.findLatestComments(bracketId, Limit.of(MAX_COMMENTS)).stream()
                .map(CommentDto::from)
                .toList());
    }

    /** Brackets created by a user, newest first, including unplayable ones. Not cached. */
    public List<Bracket> getBracketsByCreator(String userId) {
        return bracketRepository.findByCreatedByOrderByCreatedAtDescIdDesc(userId);
    }

    @Cacheable(value = "userResults", key = "#userId + ':' + (#bracketId ?: 'all')")
    public List<Result> getUserResults(String userId, Long bracketId) {
        return bracketId == null
                ? resultRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId)
                : resultRepository.findByBracketIdAndUserIdOrderByCreatedAtAscIdAsc(bracketId, userId);
    }

    // ---- Bracket creation --------------------------------------------------------------------

    /**
     * Creates a bracket and all of its entries in one transaction, so a failure never leaves an
     * empty, unplayable bracket behind. URLs are validated (including DNS) before the transaction
     * opens, so no database connection is held during lookups.
     */
    @Caching(evict = {
            @CacheEvict(value = "brackets", allEntries = true),
            @CacheEvict(value = "popularBrackets", allEntries = true)
    })
    public Bracket createBracket(CreateBracketRequest request, String createdBy) {
        String name = Sanitizer.stripToPlain(request.name(), 100);
        String description = Sanitizer.stripToPlain(request.description(), 2000);
        String category = Sanitizer.stripToPlain(request.category(), 50);
        String type = request.type();

        Map<String, String> errors = new LinkedHashMap<>();
        if (name == null || name.isBlank()) {
            errors.put("name", "Bracket name is required");
        }
        if (category == null || category.isBlank()) {
            category = Categories.DEFAULT;
        } else {
            Optional<String> known = Categories.canonical(category);
            if (known.isEmpty()) {
                errors.put("category", "Category must be one of " + String.join(", ", Categories.ALL));
            }
            category = known.orElse(category);
        }
        if (description != null && description.isBlank()) {
            description = null;
        }

        List<Item> items = new ArrayList<>();
        MediaUrlValidator.Session urls = mediaUrlValidator.session();
        for (int i = 0; i < request.items().size(); i++) {
            CreateBracketRequest.NewItemRequest entry = request.items().get(i);
            String title = Sanitizer.stripToPlain(entry.title(), 150);
            String label = "Entry " + (i + 1) + (title == null || title.isBlank() ? "" : " (\"" + title + "\")");
            if (title == null || title.isBlank()) {
                errors.put("items[" + i + "].title", label + ": title is required");
                continue;
            }
            String problem = urls.check(entry.mediaUrl(), type);
            if (problem != null) {
                errors.put("items[" + i + "].mediaUrl", label + ": " + problem);
                continue;
            }
            items.add(new Item(null, title, entry.mediaUrl().trim(), type));
        }
        if (!errors.isEmpty()) {
            throw new InvalidRequestException(errors.values().iterator().next(), errors);
        }

        Bracket bracket = new Bracket(name, description, type, category, createdBy);
        return transactionTemplate.execute(status -> {
            Bracket saved = bracketRepository.save(bracket);
            items.forEach(item -> item.setBracketId(saved.getId()));
            itemRepository.saveAll(items);
            return saved;
        });
    }
}
