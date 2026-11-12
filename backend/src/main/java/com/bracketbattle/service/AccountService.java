package com.bracketbattle.service;

import com.bracketbattle.config.CacheEvictor;
import com.bracketbattle.repository.ReportRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * Deleting what Duely keeps about a signed-in user (DELETE /me). Their runs stay as anonymous runs,
 * so other people's leaderboards don't change, but lose the name and comment they published.
 * Their brackets go too, unless someone else has played them: those runs are other people's, so
 * such a bracket stays up without an owner. The Google account itself is not Duely's to delete.
 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;
    private final ModerationService moderationService;
    private final ReportRepository reportRepository;
    private final CacheEvictor caches;

    public AccountService(JdbcTemplate jdbc, TransactionTemplate transactionTemplate, ModerationService moderationService,
                          ReportRepository reportRepository, CacheEvictor caches) {
        this.jdbc = jdbc;
        this.transactionTemplate = transactionTemplate;
        this.moderationService = moderationService;
        this.reportRepository = reportRepository;
        this.caches = caches;
    }

    private record Deleted(List<Long> brackets, List<Long> played, List<Long> commented) {}

    public void deleteAccount(String uid) {
        Deleted deleted = transactionTemplate.execute(status -> {
            List<Long> played = jdbc.queryForList("SELECT DISTINCT bracket_id FROM results WHERE user_id = ?", Long.class, uid);
            List<Long> commented = jdbc.queryForList("""
                    SELECT DISTINCT bracket_id FROM results
                    WHERE user_id = ? AND (comment IS NOT NULL OR display_name IS NOT NULL)
                    """, Long.class, uid);
            List<Long> unplayed = jdbc.queryForList("""
                    SELECT b.id FROM brackets b
                    WHERE b.created_by = ?
                      AND NOT EXISTS (SELECT 1 FROM results r WHERE r.bracket_id = b.id AND r.user_id IS DISTINCT FROM ?)
                    ORDER BY b.id
                    """, Long.class, uid, uid);
            // Only this user has runs there, so nobody else's cached history names these brackets.
            unplayed.forEach(moderationService::deleteBracketInTransaction);
            jdbc.update("UPDATE brackets SET created_by = NULL WHERE created_by = ?", uid);
            jdbc.update("""
                    UPDATE reports SET resolved_at = now()
                    WHERE resolved_at IS NULL AND target_type = 'comment'
                      AND target_id IN (SELECT id FROM results WHERE user_id = ? AND comment IS NOT NULL)
                    """, uid);
            jdbc.update("UPDATE results SET user_id = NULL, comment = NULL, display_name = NULL WHERE user_id = ?", uid);
            reportRepository.forgetReporter(uid);
            return new Deleted(unplayed, played, commented);
        });
        if (deleted == null) return;

        deleted.brackets().forEach(id -> moderationService.evictDeletedBracket(id, List.of()));
        caches.evictUserResults(uid, deleted.played());
        List<Long> commentsChanged = new ArrayList<>(deleted.commented());
        commentsChanged.removeAll(deleted.brackets());
        caches.evictAll("bracketComments", commentsChanged);
        log.info("Deleted account data: {} brackets removed, runs on {} brackets anonymised",
                deleted.brackets().size(), deleted.played().size());
    }
}
