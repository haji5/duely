package com.bracketbattle.repository;

import com.bracketbattle.dto.ReportDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Reports of brackets and comments, and the moderation queue built from them. Taking action on a
 * target (hiding, deleting, clearing a comment) resolves every open report about it, so the queue
 * only holds what still needs a look.
 */
@Repository
public class ReportRepository {

    /** The queue is read by a person: the newest few hundred are plenty, and it stays bounded. */
    public static final int MAX_LISTED = 200;

    private final JdbcTemplate jdbc;

    public ReportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(String targetType, long targetId, String reason, String details, String reporterUid) {
        jdbc.update("INSERT INTO reports (target_type, target_id, reason, details, reporter_uid) VALUES (?, ?, ?, ?, ?)",
                targetType, targetId, reason, details, reporterUid);
    }

    /** Open reports only, or all of them; newest first, at most {@link #MAX_LISTED}. */
    public List<ReportDto> list(boolean openOnly) {
        return jdbc.query("""
                SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.created_at, r.resolved_at,
                       COALESCE(b.id, rb.id) AS bracket_id, COALESCE(b.name, rb.name) AS bracket_name,
                       COALESCE(b.hidden_at, rb.hidden_at) AS hidden_at,
                       res.comment, res.display_name
                FROM reports r
                LEFT JOIN brackets b ON r.target_type = 'bracket' AND b.id = r.target_id
                LEFT JOIN results res ON r.target_type = 'comment' AND res.id = r.target_id
                LEFT JOIN brackets rb ON rb.id = res.bracket_id
                WHERE (NOT ? OR r.resolved_at IS NULL)
                ORDER BY r.created_at DESC, r.id DESC
                LIMIT ?
                """, ReportRepository::row, openOnly, MAX_LISTED);
    }

    /** Marks one report resolved; false if there is no such report. Resolving twice keeps the first time. */
    public boolean resolve(long id) {
        return jdbc.update("UPDATE reports SET resolved_at = COALESCE(resolved_at, now()) WHERE id = ?", id) > 0;
    }

    /** Resolves the open reports about a bracket itself. */
    public void resolveForBracket(long bracketId) {
        jdbc.update("UPDATE reports SET resolved_at = now() WHERE resolved_at IS NULL AND target_type = 'bracket' AND target_id = ?",
                bracketId);
    }

    /** Resolves the open reports about a bracket and about every comment left on it, before it is deleted. */
    public void resolveForBracketAndComments(long bracketId) {
        resolveForBracket(bracketId);
        jdbc.update("""
                UPDATE reports SET resolved_at = now()
                WHERE resolved_at IS NULL AND target_type = 'comment'
                  AND target_id IN (SELECT id FROM results WHERE bracket_id = ?)
                """, bracketId);
    }

    /** Resolves the open reports about one comment (a result id). */
    public void resolveForComment(long resultId) {
        jdbc.update("UPDATE reports SET resolved_at = now() WHERE resolved_at IS NULL AND target_type = 'comment' AND target_id = ?",
                resultId);
    }

    /** Forgets who filed a user's reports; the reports themselves stay for the moderators. */
    public void forgetReporter(String uid) {
        jdbc.update("UPDATE reports SET reporter_uid = NULL WHERE reporter_uid = ?", uid);
    }

    private static ReportDto row(ResultSet rs, int rowNum) throws SQLException {
        return new ReportDto(
                rs.getLong("id"),
                rs.getString("target_type"),
                rs.getLong("target_id"),
                rs.getString("reason"),
                rs.getString("details"),
                instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("resolved_at")),
                rs.getObject("bracket_id", Long.class),
                rs.getString("bracket_name"),
                rs.getTimestamp("hidden_at") != null,
                rs.getString("comment"),
                rs.getString("display_name"));
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
