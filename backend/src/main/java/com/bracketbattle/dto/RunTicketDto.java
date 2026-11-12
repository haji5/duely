package com.bracketbattle.dto;

import java.util.List;

/**
 * A started run: the signed ticket to submit with the result, the entrants the server picked in
 * seeding order, and the bracket size (slots, so {@code size - entrantIds.size()} are byes).
 */
public record RunTicketDto(String ticket, List<Long> entrantIds, int size) {}
