package com.bracketbattle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * A report of a bracket or a comment. A comment is identified by its id in the public comment
 * list (the run it was left with). The reason is checked against ReportReasons in the service.
 */
public record ReportRequest(
        @NotBlank(message = "Say what you are reporting")
        @Pattern(regexp = "bracket|comment", message = "You can report a bracket or a comment")
        String targetType,

        @NotNull(message = "Say what you are reporting")
        @Positive(message = "Say what you are reporting")
        Long targetId,

        @NotBlank(message = "Pick a reason")
        @Size(max = 30, message = "Pick a reason")
        String reason,

        @Size(max = 500, message = "Details must be at most 500 characters")
        String details
) {}
