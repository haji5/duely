package com.bracketbattle.model;

import jakarta.validation.constraints.NotNull;

/** One real (non-bye) match played during a run. */
public record MatchOutcome(@NotNull Long winnerId, @NotNull Long loserId) {}
