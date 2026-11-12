package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.dto.BracketDto;
import com.bracketbattle.dto.BracketListQuery;
import com.bracketbattle.dto.BracketPageDto;
import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.HomeDto;
import com.bracketbattle.dto.ItemDto;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.ResultDto;
import com.bracketbattle.media.MediaUrlValidator;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Categories;
import com.bracketbattle.model.Item;
import com.bracketbattle.repository.BracketListRepository;
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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BracketService {

    public static final int MAX_ITEMS = 500;
    public static final int MAX_COMMENTS = 50;
    public static final int MAX_USER_RESULTS = 100;
    static final int HOME_LIST_SIZE = 6;
    static final int HOME_PER_CATEGORY = 3;
    static final int HOME_MAX_CATEGORIES = 12;

    private final BracketRepository bracketRepository;
    private final BracketListRepository bracketListRepository;
    private final ItemRepository itemRepository;
    private final ResultRepository resultRepository;
    private final ItemStatsRepository itemStatsRepository;
    private final MediaUrlValidator mediaUrlValidator;
    private final TransactionTemplate transactionTemplate;

    public BracketService(BracketRepository bracketRepository, BracketListRepository bracketListRepository,
                          ItemRepository itemRepository, ResultRepository resultRepository,
                          ItemStatsRepository itemStatsRepository,
                          MediaUrlValidator mediaUrlValidator, TransactionTemplate transactionTemplate) {
        this.bracketRepository = bracketRepository;
        this.bracketListRepository = bracketListRepository;
        this.itemRepository = itemRepository;
        this.resultRepository = resultRepository;
        this.itemStatsRepository = itemStatsRepository;
        this.mediaUrlValidator = mediaUrlValidator;
        this.transactionTemplate = transactionTemplate;
    }

    // ---- Reads -------------------------------------------------------------------------------

    /** A page of the public list. Unfiltered first pages are cached (see BracketListQuery#cacheable). */
    @Cacheable(value = "bracketPages", key = "#query.cacheKey()", condition = "#query.cacheable()")
    public BracketPageDto listBrackets(BracketListQuery query) {
        return bracketListRepository.listPublic(query);
    }

    /** The home page's lists: the most played, the newest, and the best of each category. */
    @Cacheable("home")
    public HomeDto getHome() {
        return new HomeDto(
                bracketListRepository.top(BracketListQuery.Sort.POPULAR, HOME_LIST_SIZE, true),
                bracketListRepository.top(BracketListQuery.Sort.NEWEST, HOME_LIST_SIZE, false),
                bracketListRepository.topPerCategory(HOME_PER_CATEGORY, HOME_MAX_CATEGORIES));
    }

    @Cacheable(value = "bracket", key = "#id", unless = "#result == null")
    public Optional<BracketDto> getBracketById(Long id) {
        return bracketRepository.findById(id).map(BracketDto::from);
    }

    @Cacheable(value = "bracketItems", key = "#bracketId")
    public List<ItemDto> getBracketItems(Long bracketId) {
        return new ArrayList<>(itemRepository.findByBracketIdOrderByIdAsc(bracketId).stream().map(ItemDto::from).toList());
    }

    @Cacheable(value = "bracketRankings", key = "#bracketId")
    public List<ItemRankingDto> getBracketRankings(Long bracketId) {
        return itemStatsRepository.findRankings(bracketId);
    }

    @Cacheable(value = "bracketComments", key = "#bracketId")
    public List<CommentDto> getBracketComments(Long bracketId) {
        return new ArrayList<>(resultRepository.findLatestComments(bracketId, Limit.of(MAX_COMMENTS)).stream()
                .map(CommentDto::from)
                .toList());
    }

    /** A page of a user's own brackets, including hidden and unplayable ones. Not cached. */
    public BracketPageDto getBracketsByCreator(String userId, BracketListQuery query) {
        return bracketListRepository.listByCreator(userId, query);
    }

    /** A user's latest {@link #MAX_USER_RESULTS} runs of a bracket, oldest first. */
    @Cacheable(value = "userResults", key = "#userId + ':' + #bracketId")
    public List<ResultDto> getUserResults(String userId, long bracketId) {
        List<ResultDto> latest = new ArrayList<>(resultRepository.findByBracketIdAndUserIdOrderByCreatedAtDescIdDesc(
                bracketId, userId, Limit.of(MAX_USER_RESULTS)).stream().map(ResultDto::from).toList());
        Collections.reverse(latest);
        return latest;
    }

    // ---- Bracket creation --------------------------------------------------------------------

    /**
     * Creates a bracket and all of its entries in one transaction, so a failure never leaves an
     * empty, unplayable bracket behind. URLs are validated (including DNS) before the transaction
     * opens, so no database connection is held during lookups.
     */
    @Caching(evict = {
            @CacheEvict(value = "bracketPages", allEntries = true),
            @CacheEvict(value = "home", allEntries = true)
    })
    public BracketDto createBracket(CreateBracketRequest request, String createdBy) {
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
        bracket.setItemCount(items.size());
        return transactionTemplate.execute(status -> {
            Bracket saved = bracketRepository.save(bracket);
            items.forEach(item -> item.setBracketId(saved.getId()));
            itemRepository.saveAll(items);
            return BracketDto.from(saved);
        });
    }
}
