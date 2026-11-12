package com.bracketbattle.dto;

import jakarta.validation.constraints.NotNull;

/** Asks the server to start a run of the given bracket size (a power of two, see BracketSizes). */
public record StartRunRequest(@NotNull(message = "Bracket size is required") Integer size) {}
