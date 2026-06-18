package com.bracketbattle.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Request DTO for saving bracket voting results.
 * Contains a ranked list of item IDs representing the user's preferences.
 * Maximum of 500 items can be ranked to prevent memory exhaustion.
 */
public class SaveResultRequest {

    @NotNull(message = "Ranking list must not be null")
    @NotEmpty(message = "Ranking list cannot be empty")
    @Size(min = 1, max = 500, message = "Ranking must contain between 1 and 500 items")
    private List<@NotNull(message = "Item ID must not be null") @Positive(message = "Item ID must be positive") Long> ranking;

    @NotNull(message = "Submission token must not be null")
    @Size(min = 1, max = 255, message = "Submission token must be between 1 and 255 characters")
    private String submissionToken;

    @Size(max = 100, message = "Display name must not exceed 100 characters")
    private String displayName;

    @Size(max = 500, message = "Comment must not exceed 500 characters")
    private String comment;

    public List<Long> getRanking() { return ranking; }
    public void setRanking(List<Long> ranking) { this.ranking = ranking; }

    public String getSubmissionToken() { return submissionToken; }
    public void setSubmissionToken(String submissionToken) { this.submissionToken = submissionToken; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
