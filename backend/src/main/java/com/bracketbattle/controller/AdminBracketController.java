package com.bracketbattle.controller;

import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.service.StatsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-only maintenance of a bracket's data. */
@RestController
@RequestMapping("/admin/brackets")
@PreAuthorize("hasRole('ADMIN')")
public class AdminBracketController {

    private static final Logger log = LoggerFactory.getLogger(AdminBracketController.class);

    private final BracketRepository bracketRepository;
    private final StatsService statsService;

    public AdminBracketController(BracketRepository bracketRepository, StatsService statsService) {
        this.bracketRepository = bracketRepository;
        this.statsService = statsService;
    }

    /** Recomputes the leaderboard from the bracket's counted runs, e.g. after removing one by hand. */
    @PostMapping("/{id}/stats/rebuild")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rebuildStats(@PathVariable Long id) {
        if (!bracketRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found");
        }
        statsService.rebuild(id);
        log.info("Rebuilt the leaderboard of bracket {}", id);
    }
}
