package com.bracketbattle.dto;

import com.bracketbattle.model.MatchOutcome;
import jakarta.validation.GroupSequence;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A finished run: the ticket the server issued when it started, plus the real matches in the
 * order they were played. The server derives the ranking from the matches. Tabs opened before
 * tickets existed post {@code ranking} and {@code submissionToken} instead; they have no ticket
 * and are told to reload. The fields are checked before the list elements (see
 * {@link ValidationOrder}); the class-level sequence keeps every constraint in force for a plain
 * {@code @Valid} too.
 */
@GroupSequence({ValidationOrder.Fields.class, SaveResultRequest.class})
public record SaveResultRequest(
        @NotBlank(message = "This page is out of date. Reload it to play again.", groups = ValidationOrder.Fields.class)
        @Size(max = 512, message = "This run's ticket is not valid. Reload the page and play again.", groups = ValidationOrder.Fields.class)
        String ticket,

        @NotNull(message = "Matches are required", groups = ValidationOrder.Fields.class)
        @Size(min = 1, max = 499, message = "A run has between 1 and 499 matches", groups = ValidationOrder.Fields.class)
        List<@NotNull(message = "Match must not be null") @Valid MatchOutcome> matches,

        @Size(max = 100, message = "Display name must be at most 100 characters", groups = ValidationOrder.Fields.class)
        String displayName,

        @Size(max = 500, message = "Comment must be at most 500 characters", groups = ValidationOrder.Fields.class)
        String comment
) {}
