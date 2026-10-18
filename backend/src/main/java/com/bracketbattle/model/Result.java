package com.bracketbattle.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * One completed run of a bracket. Immutable once saved.
 *
 * <p>userId, submissionToken and matches are hidden from JSON: the public API must not expose
 * who voted, and the token is a per-submission secret. The Valkey cache honours the same
 * annotations, which is fine because the idempotency and ownership checks read the repository.
 */
@Entity
@Table(name = "results")
public class Result {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Long>> RANKING_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<MatchOutcome>> MATCHES_TYPE = new TypeReference<>() {};

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bracket_id", nullable = false)
    private Long bracketId;

    @JsonIgnore
    @Column(name = "user_id")
    private String userId;

    @Column(name = "ranking", nullable = false, columnDefinition = "TEXT")
    private String rankingJson;

    // Null for runs saved before real match outcomes were recorded.
    @Column(name = "matches", columnDefinition = "TEXT")
    private String matchesJson;

    @Column(name = "created_at")
    private Instant createdAt;

    @JsonIgnore
    @Column(name = "submission_token")
    private String submissionToken;

    @Column(name = "display_name", length = 100)
    private String displayName;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    public Result() {}

    public Result(Long bracketId, String userId, List<Long> ranking, List<MatchOutcome> matches, String submissionToken) {
        this.bracketId = bracketId;
        this.userId = userId;
        this.submissionToken = submissionToken;
        setRanking(ranking);
        setMatches(matches);
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

    @JsonIgnore
    public String getUserId() { return userId; }
    @JsonIgnore
    public void setUserId(String userId) { this.userId = userId; }

    public List<Long> getRanking() {
        return read(rankingJson, RANKING_TYPE);
    }

    public void setRanking(List<Long> ranking) {
        this.rankingJson = write(ranking == null ? List.of() : ranking);
    }

    @JsonIgnore
    public List<MatchOutcome> getMatches() {
        return matchesJson == null ? null : read(matchesJson, MATCHES_TYPE);
    }

    @JsonIgnore
    public void setMatches(List<MatchOutcome> matches) {
        this.matchesJson = matches == null ? null : write(matches);
    }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    @JsonIgnore
    public String getSubmissionToken() { return submissionToken; }
    @JsonIgnore
    public void setSubmissionToken(String submissionToken) { this.submissionToken = submissionToken; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    private static <T> List<T> read(String json, TypeReference<List<T>> type) {
        if (json == null || json.isEmpty()) {
            return new ArrayList<>(); // mutable: the cache serialiser can't rebuild List.of()
        }
        try {
            return JSON.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt JSON column in results", e);
        }
    }

    private static String write(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise result column", e);
        }
    }
}
