package com.bracketbattle.dto;

import com.bracketbattle.model.Result;

import java.time.Instant;
import java.util.List;

/** A public comment left with a run. Plain class so the Valkey cache can round-trip it. */
public class CommentDto {
    private Long id;
    private String displayName;
    private String comment;
    private Instant createdAt;
    private Long championItemId;

    public CommentDto() {}

    public static CommentDto from(Result result) {
        CommentDto dto = new CommentDto();
        dto.id = result.getId();
        dto.displayName = result.getDisplayName();
        dto.comment = result.getComment();
        dto.createdAt = result.getCreatedAt();
        List<Long> ranking = result.getRanking();
        dto.championItemId = ranking.isEmpty() ? null : ranking.get(0);
        return dto;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Long getChampionItemId() { return championItemId; }
    public void setChampionItemId(Long championItemId) { this.championItemId = championItemId; }
}
