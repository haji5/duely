package com.bracketbattle.dto;

import com.bracketbattle.model.MatchOutcome;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A finished run: the final ranking (champion first) plus the real matches that produced it.
 * Cross-field rules (membership, one loss per non-champion, ...) are checked in the service.
 */
public record SaveResultRequest(
        @NotNull(message = "Ranking is required")
        @Size(min = 2, max = 500, message = "Ranking must contain between 2 and 500 items")
        List<@NotNull(message = "Item ID must not be null") @Positive(message = "Item ID must be positive") Long> ranking,

        @NotNull(message = "Matches are required")
        @Size(max = 499, message = "Too many matches")
        List<@NotNull(message = "Match must not be null") @Valid MatchOutcome> matches,

        @NotBlank(message = "Submission token is required")
        @Size(max = 100, message = "Submission token must be at most 100 characters")
        String submissionToken,

        @Size(max = 100, message = "Display name must be at most 100 characters")
        String displayName,

        @Size(max = 500, message = "Comment must be at most 500 characters")
        String comment
) {}
