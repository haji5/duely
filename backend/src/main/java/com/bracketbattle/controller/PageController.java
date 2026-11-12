package com.bracketbattle.controller;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.seo.PageHeads;
import com.bracketbattle.seo.SpaShell;
import com.bracketbattle.service.BracketAccess;
import com.bracketbattle.service.BracketService;
import org.jsoup.nodes.Document;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * The SPA shell with per-route head tags and a text summary (see {@link PageHeads}). nginx maps
 * {@code /}, {@code /bracket/{id}} and {@code /results/{id}} here and blocks {@code /api/pages/}.
 * Reads go through the cached BracketService, so a page view costs the same as the API calls the
 * page makes anyway. A missing or hidden bracket is a 404 that still carries the shell, so React
 * renders its not-found page (or, for the owner signed in, loads the hidden bracket through the API).
 */
@RestController
public class PageController {

    private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);

    private final BracketService bracketService;
    private final BracketAccess bracketAccess;
    private final SpaShell spaShell;
    private final PageHeads pageHeads;

    public PageController(BracketService bracketService, BracketAccess bracketAccess, SpaShell spaShell, PageHeads pageHeads) {
        this.bracketService = bracketService;
        this.bracketAccess = bracketAccess;
        this.spaShell = spaShell;
        this.pageHeads = pageHeads;
    }

    @GetMapping("/pages/home")
    public ResponseEntity<String> home() {
        return html(HttpStatus.OK, pageHeads.home(spaShell.get()));
    }

    @GetMapping("/pages/bracket/{id}")
    public ResponseEntity<String> bracket(@PathVariable String id) {
        Optional<Bracket> bracket = findBracket(id);
        if (bracket.isEmpty()) {
            return notFound();
        }
        Long bracketId = bracket.get().getId();
        return html(HttpStatus.OK, pageHeads.bracket(spaShell.get(), bracket.get(), bracketService.getBracketItems(bracketId)));
    }

    @GetMapping("/pages/results/{id}")
    public ResponseEntity<String> results(@PathVariable String id) {
        Optional<Bracket> bracket = findBracket(id);
        if (bracket.isEmpty()) {
            return notFound();
        }
        Long bracketId = bracket.get().getId();
        return html(HttpStatus.OK, pageHeads.results(spaShell.get(), bracket.get(),
                bracketService.getBracketItems(bracketId), bracketService.getBracketRankings(bracketId)));
    }

    /**
     * Ids too long for a Long are simply unknown brackets, not a 400. Page loads carry no bearer
     * token, so a hidden bracket is never rendered here, whoever asks.
     */
    private Optional<Bracket> findBracket(String id) {
        try {
            return bracketAccess.findVisible(Long.parseLong(id), null);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private ResponseEntity<String> notFound() {
        return html(HttpStatus.NOT_FOUND, PageHeads.notFound(spaShell.get()));
    }

    private static ResponseEntity<String> html(HttpStatus status, Document page) {
        return ResponseEntity.status(status).contentType(HTML).body(page.outerHtml());
    }
}
