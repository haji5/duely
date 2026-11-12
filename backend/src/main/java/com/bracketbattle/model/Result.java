package com.bracketbattle.model;

import com.bracketbattle.advice.InvalidRequestException;
import com.bracketbattle.scoring.RunScoring;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * One completed run of a bracket. Immutable once saved. Persistence only: its submitter gets a
 * ResultDto, everyone else a CommentDto, so who voted, the ticket nonce and whether it counted
 * never leave the server.
 */
@Entity
@Table(name = "results")
public class Result {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<Long>> RANKING_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<MatchOutcome>> MATCHES_TYPE = new TypeReference<>() {};

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bracket_id", nullable = false)
    private Long bracketId;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "ranking", nullable = false, columnDefinition = "TEXT")
    private String rankingJson;

    // Null for runs saved before real match outcomes were recorded.
    @Column(name = "matches", columnDefinition = "TEXT")
    private String matchesJson;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "submission_token")
    private String submissionToken;

    @Column(name = "display_name", length = 100)
    private String displayName;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    /** Whether this run added to the leaderboard (see RunService). Every valid run is saved. */
    @Column(name = "counted", nullable = false)
    private boolean counted = true;

    public Result() {}

    public Result(Long bracketId, String userId, List<Long> ranking, List<MatchOutcome> matches, String submissionToken) {
        this.bracketId = bracketId;
        this.userId = userId;
        this.submissionToken = submissionToken;
        setRanking(ranking);
        setMatches(matches);
    }

    /** The scoring of this run: tiers from the matches, or list positions for legacy runs. */
    public RunScoring.Scored scored() {
        List<MatchOutcome> matches = getMatches();
        if (matches != null) {
            try {
                return RunScoring.score(matches);
            } catch (InvalidRequestException e) {
                // Accepted under older, looser rules; its stored ranking is all we can trust.
            }
        }
        return RunScoring.legacy(getRanking());
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getBracketId() { return bracketId; }
    public void setBracketId(Long bracketId) { this.bracketId = bracketId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public List<Long> getRanking() {
        return read(rankingJson, RANKING_TYPE);
    }

    public void setRanking(List<Long> ranking) {
        this.rankingJson = write(ranking == null ? List.of() : ranking);
    }

    public List<MatchOutcome> getMatches() {
        return matchesJson == null ? null : read(matchesJson, MATCHES_TYPE);
    }

    public void setMatches(List<MatchOutcome> matches) {
        this.matchesJson = matches == null ? null : write(matches);
    }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getSubmissionToken() { return submissionToken; }
    public void setSubmissionToken(String submissionToken) { this.submissionToken = submissionToken; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public boolean isCounted() { return counted; }
    public void setCounted(boolean counted) { this.counted = counted; }

    private static <T> List<T> read(String json, TypeReference<List<T>> type) {
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return JSON.readValue(json, type);
        } catch (JacksonException e) {
            throw new IllegalStateException("Corrupt JSON column in results", e);
        }
    }

    private static String write(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JacksonException e) {
            throw new IllegalStateException("Could not serialise result column", e);
        }
    }
}
