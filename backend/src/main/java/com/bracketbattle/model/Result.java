package com.bracketbattle.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;

@Entity
@Table(name = "results", indexes = {
    @Index(name = "idx_user_bracket_token", columnList = "user_id, bracket_id, submission_token")
})
public class Result {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bracket_id", nullable = false)
    private Long bracketId;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "ranking", nullable = false, columnDefinition = "TEXT")
    private String rankingJson;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Version
    @Column(name = "version")
    private Long version;

    @Column(name = "submission_token", unique = true)
    private String submissionToken;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bracket_id", insertable = false, updatable = false)
    @JsonIgnore
    private Bracket bracket;

    @Transient
    private ObjectMapper objectMapper = new ObjectMapper();

    // Constructors
    public Result() {}

    public Result(Long bracketId, String userId, List<Long> ranking) {
        this.bracketId = bracketId;
        this.userId = userId;
        this.setRanking(ranking);
        this.createdAt = LocalDateTime.now();
    }

    public Result(Long bracketId, String userId, List<Long> ranking, String submissionToken) {
        this.bracketId = bracketId;
        this.userId = userId;
        this.setRanking(ranking);
        this.submissionToken = submissionToken;
        this.createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getBracketId() {
        return bracketId;
    }

    public void setBracketId(Long bracketId) {
        this.bracketId = bracketId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public List<Long> getRanking() {
        if (rankingJson == null || rankingJson.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(rankingJson, new TypeReference<List<Long>>() {});
        } catch (JsonProcessingException e) {
            return new ArrayList<>();
        }
    }

    public void setRanking(List<Long> ranking) {
        try {
            this.rankingJson = objectMapper.writeValueAsString(ranking);
        } catch (JsonProcessingException e) {
            this.rankingJson = "[]";
        }
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public String getSubmissionToken() {
        return submissionToken;
    }

    public void setSubmissionToken(String submissionToken) {
        this.submissionToken = submissionToken;
    }

    public Bracket getBracket() {
        return bracket;
    }

    public void setBracket(Bracket bracket) {
        this.bracket = bracket;
    }
}
