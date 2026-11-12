package com.bracketbattle.controller;

import com.bracketbattle.dto.ReportDto;
import com.bracketbattle.service.ModerationService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Admin-only: the report queue, and removing what breaks the rules from runs and comments. */
@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminModerationController {

    private final ModerationService moderationService;

    public AdminModerationController(ModerationService moderationService) {
        this.moderationService = moderationService;
    }

    /** Newest first; open ones only unless {@code open=false}. */
    @GetMapping("/reports")
    public List<ReportDto> reports(@RequestParam(defaultValue = "true") boolean open) {
        return moderationService.listReports(open);
    }

    /** Closes a report without acting on it, e.g. when the target is fine. */
    @PostMapping("/reports/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable Long id) {
        if (!moderationService.resolveReport(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found");
        }
    }

    /** Clears a run's comment and display name; the run still counts. */
    @DeleteMapping("/results/{id}/comment")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearComment(@PathVariable Long id) {
        if (!moderationService.clearComment(id)) {
            throw runNotFound();
        }
    }

    /** Deletes a run and rebuilds its bracket's leaderboard without it. */
    @DeleteMapping("/results/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteResult(@PathVariable Long id) {
        if (!moderationService.deleteResult(id)) {
            throw runNotFound();
        }
    }

    private static ResponseStatusException runNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Run not found");
    }
}
