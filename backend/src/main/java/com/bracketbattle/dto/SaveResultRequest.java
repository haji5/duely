package com.bracketbattle.dto;

import com.bracketbattle.model.MatchOutcome;
import jakarta.validation.GroupSequence;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A finished run: the final ranking (champion first) plus the real matches that produced it.
 * Cross-field rules (membership, one loss per non-champion, ...) are checked in the service.
 * The fields are checked before the list elements (see {@link ValidationOrder}); the class-level
 * sequence keeps every constraint in force for a plain {@code @Valid} too.
 */
@GroupSequence({ValidationOrder.Fields.class, SaveResultRequest.class})
public record SaveResultRequest(
        @NotNull(message = "Ranking is required", groups = ValidationOrder.Fields.class)
        @Size(min = 2, max = 500, message = "Ranking must contain between 2 and 500 items", groups = ValidationOrder.Fields.class)
        List<@NotNull(message = "Item ID must not be null") @Positive(message = "Item ID must be positive") Long> ranking,

        @NotNull(message = "Matches are required", groups = ValidationOrder.Fields.class)
        @Size(max = 499, message = "Too many matches", groups = ValidationOrder.Fields.class)
        List<@NotNull(message = "Match must not be null") @Valid MatchOutcome> matches,

        @NotBlank(message = "Submission token is required", groups = ValidationOrder.Fields.class)
        @Size(max = 100, message = "Submission token must be at most 100 characters", groups = ValidationOrder.Fields.class)
        String submissionToken,

        @Size(max = 100, message = "Display name must be at most 100 characters", groups = ValidationOrder.Fields.class)
        String displayName,

        @Size(max = 500, message = "Comment must be at most 500 characters", groups = ValidationOrder.Fields.class)
        String comment
) {}
