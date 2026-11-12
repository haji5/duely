package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.dto.RunTicketDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.MatchOutcome;
import com.bracketbattle.model.Result;
import com.bracketbattle.ratelimit.RateLimiter;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.scoring.BracketSizes;
import com.bracketbattle.scoring.RunScoring;
import com.bracketbattle.util.Sanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Runs from start to leaderboard. The server picks who plays ({@link #startRun}), the client
 * plays the matches, and the server derives the ranking from them ({@link #saveRun}). How much
 * one person can move a leaderboard is bounded: every valid run is saved and shown to its
 * player, but only runs that look played and fit the per-bracket daily quota are counted.
 */
@Service
public class RunService {

    private static final Logger log = LoggerFactory.getLogger(RunService.class);

    private final BracketService bracketService;
    private final BracketRepository bracketRepository;
    private final ResultRepository resultRepository;
    private final ItemStatsRepository itemStatsRepository;
    private final RunTickets tickets;
    private final RateLimiter rateLimiter;
    private final TransactionTemplate transactionTemplate;
    private final long minMillisPerMatch;
    private final Clock clock = Clock.systemUTC();
    private final SecureRandom random = new SecureRandom();

    public RunService(BracketService bracketService, BracketRepository bracketRepository,
                      ResultRepository resultRepository, ItemStatsRepository itemStatsRepository,
                      RunTickets tickets, RateLimiter rateLimiter, TransactionTemplate transactionTemplate,
                      @Value("${app.runs.min-ms-per-match:400}") long minMillisPerMatch) {
        this.bracketService = bracketService;
        this.bracketRepository = bracketRepository;
        this.resultRepository = resultRepository;
        this.itemStatsRepository = itemStatsRepository;
        this.tickets = tickets;
        this.rateLimiter = rateLimiter;
        this.transactionTemplate = transactionTemplate;
        this.minMillisPerMatch = minMillisPerMatch;
    }

    /** Picks {@code min(size, entries)} random entrants in seeding order and signs them. */
    public RunTicketDto startRun(long bracketId, int size) {
        if (bracketService.getBracketById(bracketId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found");
        }
        List<Long> ids = new ArrayList<>(bracketService.getBracketItems(bracketId).stream().map(Item::getId).toList());
        List<Integer> options = BracketSizes.options(ids.size());
        if (!options.contains(size)) {
            String message = options.isEmpty()
                    ? "This bracket needs at least 2 entries to play"
                    : "A bracket of " + ids.size() + " entries can be played at sizes " + options;
            throw new InvalidRequestException(message, Map.of("size", message));
        }
        Collections.shuffle(ids, random);
        List<Long> entrants = List.copyOf(ids.subList(0, Math.min(size, ids.size())));
        return new RunTicketDto(tickets.issue(bracketId, entrants), entrants, size);
    }

    /**
     * Saves a finished run. Idempotent on the ticket: a retry by the same submitter returns the
     * original result, while a ticket reused by someone else is a 409.
     *
     * @param guestSubject the limiter subject for a guest (their network); unused when signed in
     */
    @Caching(evict = {
            @CacheEvict(value = "bracketRankings", key = "#bracketId"),
            @CacheEvict(value = "bracketStats", key = "#bracketId"),
            @CacheEvict(value = "bracketComments", key = "#bracketId"),
            @CacheEvict(value = "userResults", key = "#userId + ':all'", condition = "#userId != null"),
            @CacheEvict(value = "userResults", key = "#userId + ':' + #bracketId", condition = "#userId != null")
    })
    public Result saveRun(Long bracketId, String userId, String guestSubject, SaveResultRequest request) {
        if (!bracketRepository.existsById(bracketId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found");
        }
        RunTickets.Claims claims = tickets.verify(request.ticket(), bracketId);
        List<MatchOutcome> matches = request.matches();
        Set<Long> named = new HashSet<>();
        matches.forEach(m -> {
            named.add(m.winnerId());
            named.add(m.loserId());
        });
        if (!MessageDigest.isEqual(RunTickets.entrantHash(named), claims.entrantHash())) {
            String message = "The matches don't name the entries this run was started with";
            throw new InvalidRequestException(message, Map.of("matches", message));
        }
        RunScoring.Scored scored = RunScoring.score(matches);

        Optional<Result> existing = resultRepository.findBySubmissionToken(claims.nonce());
        if (existing.isPresent()) {
            return requireSameSubmitter(existing.get(), bracketId, userId);
        }

        boolean counted = isCounted(bracketId, userId, guestSubject, claims, matches.size());
        Result result = new Result(bracketId, userId, scored.ranking(), matches, claims.nonce());
        result.setCounted(counted);
        result.setDisplayName(blankToNull(Sanitizer.stripToPlain(request.displayName(), 100)));
        result.setComment(blankToNull(Sanitizer.stripToPlain(request.comment(), 500)));

        try {
            return transactionTemplate.execute(status -> {
                if (counted) {
                    itemStatsRepository.applyRun(bracketId, ItemStatsRepository.deltas(scored, matches));
                }
                return resultRepository.save(result);
            });
        } catch (DataIntegrityViolationException e) {
            // A concurrent request with the same ticket won the insert. The failed transaction is
            // rolled back by now, so this lookup runs in a fresh one and can see the winner's row.
            return resultRepository.findBySubmissionToken(claims.nonce())
                    .map(winner -> requireSameSubmitter(winner, bracketId, userId))
                    .orElseThrow(() -> e);
        }
    }

    /**
     * Whether a run adds to the leaderboard. Not counted, without telling the client: a run
     * faster than the UI allows (it animates every pick for over a second), and runs past the
     * daily quota for this bracket, per signed-in user or per guest network.
     */
    private boolean isCounted(long bracketId, String userId, String guestSubject, RunTickets.Claims claims, int matchCount) {
        long elapsed = Duration.between(claims.issuedAt(), clock.instant()).toMillis();
        if (elapsed < minMillisPerMatch * matchCount) {
            log.info("Run on bracket {} not counted: {} matches in {} ms", bracketId, matchCount, elapsed);
            return false;
        }
        boolean signedIn = userId != null;
        boolean withinQuota = rateLimiter.tryConsume(signedIn ? "counted-user" : "counted-ip",
                bracketId + ":" + (signedIn ? userId : guestSubject));
        if (!withinQuota) {
            log.info("Run on bracket {} not counted: daily quota used", bracketId);
        }
        return withinQuota;
    }

    private static Result requireSameSubmitter(Result existing, Long bracketId, String userId) {
        if (!Objects.equals(existing.getBracketId(), bracketId) || !Objects.equals(existing.getUserId(), userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This run has already been saved");
        }
        return existing;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
