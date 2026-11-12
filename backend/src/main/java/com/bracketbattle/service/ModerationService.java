package com.bracketbattle.service;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.config.CacheEvictor;
import com.bracketbattle.dto.ReportDto;
import com.bracketbattle.dto.ReportRequest;
import com.bracketbattle.model.ReportReasons;
import com.bracketbattle.model.Result;
import com.bracketbattle.repository.ItemStatsRepository;
import com.bracketbattle.repository.ReportRepository;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.util.Sanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Reports, and what moderators and owners do about them: hide or delete a bracket, clear a
 * comment, delete a run. Each change commits first and then evicts exactly the cache entries it
 * made stale (see {@link CacheEvictor}); acting on a target resolves the open reports about it.
 * Authorisation is the controllers' job (BracketAccess, @PreAuthorize).
 */
@Service
public class ModerationService {

    private static final Logger log = LoggerFactory.getLogger(ModerationService.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;
    private final ItemStatsRepository itemStatsRepository;
    private final ResultRepository resultRepository;
    private final ReportRepository reportRepository;
    private final StatsService statsService;
    private final BracketAccess bracketAccess;
    private final CacheEvictor caches;

    public ModerationService(JdbcTemplate jdbc, TransactionTemplate transactionTemplate,
                             ItemStatsRepository itemStatsRepository, ResultRepository resultRepository,
                             ReportRepository reportRepository, StatsService statsService,
                             BracketAccess bracketAccess, CacheEvictor caches) {
        this.jdbc = jdbc;
        this.transactionTemplate = transactionTemplate;
        this.itemStatsRepository = itemStatsRepository;
        this.resultRepository = resultRepository;
        this.reportRepository = reportRepository;
        this.statsService = statsService;
        this.bracketAccess = bracketAccess;
        this.caches = caches;
    }

    // ---- reports -----------------------------------------------------------------------------

    /**
     * Files a report about something the caller can see: a bracket, or a comment on the public
     * comment list (identified by its run). Anything else is a 404, the same answer as for a
     * target that does not exist.
     */
    public void report(ReportRequest request, Authentication authentication, String reporterUid) {
        String reason = request.reason().trim().toLowerCase(Locale.ROOT);
        if (!ReportReasons.ALL.contains(reason)) {
            String message = "Pick one of the listed reasons";
            throw new InvalidRequestException(message, Map.of("reason", message));
        }
        String details = Sanitizer.stripToPlain(request.details(), 500);
        long targetId = request.targetId();
        if ("bracket".equals(request.targetType())) {
            bracketAccess.requireVisible(targetId, authentication);
        } else {
            Result result = resultRepository.findById(targetId)
                    .filter(r -> r.isCounted() && r.getComment() != null && !r.getComment().isBlank())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Comment not found"));
            bracketAccess.requireVisible(result.getBracketId(), authentication);
        }
        reportRepository.insert(request.targetType(), targetId, reason,
                details == null || details.isBlank() ? null : details, reporterUid);
        log.info("New report: {} {} ({})", request.targetType(), targetId, reason);
    }

    public List<ReportDto> listReports(boolean openOnly) {
        return reportRepository.list(openOnly);
    }

    public boolean resolveReport(long id) {
        return reportRepository.resolve(id);
    }

    // ---- brackets ----------------------------------------------------------------------------

    /** Hides or shows a bracket; false if it doesn't exist. Hiding resolves the reports about it. */
    public boolean setHidden(long bracketId, boolean hidden) {
        Integer changed = transactionTemplate.execute(status -> {
            int rows = jdbc.update(hidden
                    ? "UPDATE brackets SET hidden_at = COALESCE(hidden_at, now()) WHERE id = ?"
                    : "UPDATE brackets SET hidden_at = NULL WHERE id = ?", bracketId);
            if (rows > 0 && hidden) {
                reportRepository.resolveForBracket(bracketId);
            }
            return rows;
        });
        if (changed == null || changed == 0) return false;
        // Visibility is checked against the cached bracket, so its items and rankings can stay.
        caches.clear("brackets");
        caches.clear("popularBrackets");
        caches.evict("bracket", bracketId);
        log.info("Bracket {} {}", bracketId, hidden ? "hidden" : "shown again");
        return true;
    }

    /** Deletes a bracket with its entries, runs and leaderboard (the foreign keys cascade). */
    public void deleteBracket(long bracketId) {
        List<String> players = transactionTemplate.execute(status -> deleteBracketInTransaction(bracketId));
        evictDeletedBracket(bracketId, players == null ? List.of() : players);
        log.info("Bracket {} deleted", bracketId);
    }

    /**
     * The delete itself, inside the caller's transaction. Takes the exclusive stats lock so no
     * run is being added meanwhile. Returns the signed-in users who had runs on it, whose cached
     * histories now name a bracket that is gone.
     */
    List<String> deleteBracketInTransaction(long bracketId) {
        itemStatsRepository.lockExclusively(bracketId);
        List<String> players = jdbc.queryForList(
                "SELECT DISTINCT user_id FROM results WHERE bracket_id = ? AND user_id IS NOT NULL", String.class, bracketId);
        reportRepository.resolveForBracketAndComments(bracketId);
        jdbc.update("DELETE FROM brackets WHERE id = ?", bracketId);
        return players;
    }

    void evictDeletedBracket(long bracketId, List<String> players) {
        caches.evictBracket(bracketId);
        players.forEach(uid -> caches.evictUserResults(uid, List.of(bracketId)));
    }

    // ---- runs and comments -------------------------------------------------------------------

    /** Clears a run's comment and display name and keeps the run; false if there is no such run. */
    public boolean clearComment(long resultId) {
        Optional<Result> found = resultRepository.findById(resultId);
        if (found.isEmpty()) return false;
        Result result = found.get();
        transactionTemplate.executeWithoutResult(status -> {
            jdbc.update("UPDATE results SET comment = NULL, display_name = NULL WHERE id = ?", resultId);
            reportRepository.resolveForComment(resultId);
        });
        evictRun(result);
        log.info("Comment on run {} cleared", resultId);
        return true;
    }

    /**
     * Deletes a run and rebuilds its bracket's leaderboard without it, in one transaction; false
     * if there is no such run.
     */
    public boolean deleteResult(long resultId) {
        Optional<Result> found = resultRepository.findById(resultId);
        if (found.isEmpty()) return false;
        Result result = found.get();
        statsService.rebuild(result.getBracketId(), () -> {
            reportRepository.resolveForComment(resultId);
            jdbc.update("DELETE FROM results WHERE id = ?", resultId);
        });
        evictRun(result);
        log.info("Run {} on bracket {} deleted", resultId, result.getBracketId());
        return true;
    }

    /** What a run's comment or existence shows up in, besides the leaderboard. */
    private void evictRun(Result result) {
        caches.evict("bracketComments", result.getBracketId());
        if (result.getUserId() != null) {
            caches.evictUserResults(result.getUserId(), List.of(result.getBracketId()));
        }
    }
}
