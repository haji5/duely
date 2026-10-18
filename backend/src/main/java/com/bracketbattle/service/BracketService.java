package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.media.MediaUrlValidator;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemRepository;
import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

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
            category = "General";
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

    // ---- Result submission -------------------------------------------------------------------

    /**
     * Saves a finished run and adds it to the leaderboard aggregates. Idempotent on the submission
     * token: a retry by the same submitter returns the original result, while a token reused by
     * someone else (or for another bracket) is a 409.
     */
    @Caching(evict = {
            @CacheEvict(value = "bracketRankings", key = "#bracketId"),
            @CacheEvict(value = "bracketComments", key = "#bracketId"),
            @CacheEvict(value = "userResults", key = "#userId + ':all'", condition = "#userId != null"),
            @CacheEvict(value = "userResults", key = "#userId + ':' + #bracketId", condition = "#userId != null")
    })
    public Result saveBracketResult(Long bracketId, String userId, SaveResultRequest request) {
        if (!bracketRepository.existsById(bracketId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found");
        }
        List<Long> ranking = request.ranking();
        List<MatchOutcome> matches = request.matches();
        validateRun(ranking, matches, new HashSet<>(itemRepository.findIdsByBracketId(bracketId)));

        Optional<Result> existing = resultRepository.findBySubmissionToken(request.submissionToken());
        if (existing.isPresent()) {
            return requireSameSubmitter(existing.get(), bracketId, userId);
        }

        Result result = new Result(bracketId, userId, ranking, matches, request.submissionToken());
        result.setDisplayName(blankToNull(Sanitizer.stripToPlain(request.displayName(), 100)));
        result.setComment(blankToNull(Sanitizer.stripToPlain(request.comment(), 500)));

        try {
            return transactionTemplate.execute(status -> {
                Result saved = resultRepository.save(result);
                itemStatsRepository.applyRun(bracketId, ranking, matches);
                return saved;
            });
        } catch (DataIntegrityViolationException e) {
            // A concurrent request with the same token won the insert. The failed transaction is
            // rolled back by now, so this lookup runs in a fresh one and can see the winner's row.
            return resultRepository.findBySubmissionToken(request.submissionToken())
                    .map(winner -> requireSameSubmitter(winner, bracketId, userId))
                    .orElseThrow(() -> e);
        }
    }

    /**
     * A run must rank 2..500 distinct items of the bracket, and its matches must be the real games
     * of a single-elimination tournament: n-1 matches between ranked items, no self-matches or
     * repeated pairs, every item except the champion losing exactly once and the champion never.
     */
    static void validateRun(List<Long> ranking, List<MatchOutcome> matches, Set<Long> bracketItemIds) {
        if (ranking.size() < 2 || ranking.size() > MAX_ITEMS) {
            throw new InvalidRequestException("Ranking must contain between 2 and " + MAX_ITEMS + " items");
        }
        Set<Long> ranked = new HashSet<>();
        for (Long id : ranking) {
            if (!ranked.add(id)) {
                throw new InvalidRequestException("Ranking contains item " + id + " more than once");
            }
            if (!bracketItemIds.contains(id)) {
                throw new InvalidRequestException("Item " + id + " does not belong to this bracket");
            }
        }
        if (matches.size() != ranking.size() - 1) {
            throw new InvalidRequestException("A run of " + ranking.size() + " items must have exactly "
                    + (ranking.size() - 1) + " matches");
        }
        Long champion = ranking.get(0);
        Set<Long> losers = new HashSet<>();
        Set<String> pairs = new HashSet<>();
        for (MatchOutcome m : matches) {
            Long winner = m.winnerId();
            Long loser = m.loserId();
            if (!ranked.contains(winner) || !ranked.contains(loser)) {
                throw new InvalidRequestException("Matches may only involve ranked items");
            }
            if (winner.equals(loser)) {
                throw new InvalidRequestException("An item cannot play itself");
            }
            if (loser.equals(champion)) {
                throw new InvalidRequestException("The champion cannot lose a match");
            }
            if (!losers.add(loser)) {
                throw new InvalidRequestException("Item " + loser + " loses more than once");
            }
            String pair = Math.min(winner, loser) + ":" + Math.max(winner, loser);
            if (!pairs.add(pair)) {
                throw new InvalidRequestException("Items " + winner + " and " + loser + " play each other twice");
            }
        }
        // n-1 distinct losers, none of them the champion, means every other item lost exactly once.
    }

    private static Result requireSameSubmitter(Result existing, Long bracketId, String userId) {
        if (!Objects.equals(existing.getBracketId(), bracketId) || !Objects.equals(existing.getUserId(), userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Submission token has already been used");
        }
        return existing;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
