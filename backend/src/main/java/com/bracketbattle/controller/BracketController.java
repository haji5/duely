package com.bracketbattle.controller;

import com.bracketbattle.dto.AddItemRequest;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.service.BracketService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
// CORS centralized in SecurityConfig
public class BracketController {

    @Autowired
    private BracketService bracketService;

    @GetMapping("/brackets")
    public ResponseEntity<List<Bracket>> getAllBrackets() {
        List<Bracket> brackets = bracketService.getAllBrackets();
        return ResponseEntity.ok(brackets);
    }

    @GetMapping("/brackets/{id}")
    public ResponseEntity<Bracket> getBracket(@PathVariable Long id) {
        return bracketService.getBracketById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/brackets/{id}/items")
    public ResponseEntity<List<Item>> getBracketItems(@PathVariable Long id) {
        List<Item> items = bracketService.getBracketItems(id);
        return ResponseEntity.ok(items);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/results")
    public ResponseEntity<Result> saveBracketResult(
            @PathVariable Long id,
            @Valid @RequestBody SaveResultRequest payload,
            Authentication authentication) {

        String userId = (String) authentication.getPrincipal();
        Result result = bracketService.saveBracketResult(id, userId, payload.getRanking());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/brackets/{id}/results")
    public ResponseEntity<List<Result>> getBracketResults(@PathVariable Long id) {
        List<Result> results = bracketService.getBracketResults(id);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/brackets/popular")
    public ResponseEntity<List<Bracket>> getPopularBrackets() {
        List<Bracket> brackets = bracketService.getPopularBrackets();
        return ResponseEntity.ok(brackets);
    }

    @GetMapping("/users/{userId}/results")
    public ResponseEntity<List<Result>> getUserResults(@PathVariable String userId) {
        List<Result> results = bracketService.getUserResults(userId);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/brackets/{id}/users/{userId}/results")
    public ResponseEntity<List<Result>> getUserBracketResults(
            @PathVariable Long id,
            @PathVariable String userId) {
        List<Result> results = bracketService.getUserBracketResults(id, userId);
        return ResponseEntity.ok(results);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets")
    public ResponseEntity<Bracket> createBracket(@Valid @RequestBody CreateBracketRequest payload, Authentication authentication) {
        String createdBy = (String) authentication.getPrincipal();
        Bracket bracket = bracketService.createBracket(payload.getName(), payload.getDescription(), payload.getType(), createdBy);
        return ResponseEntity.ok(bracket);
    }

    @PreAuthorize("hasRole('USER')")
    @PostMapping("/brackets/{id}/items")
    public ResponseEntity<Item> addItemToBracket(
            @PathVariable Long id,
            @Valid @RequestBody AddItemRequest payload) {

        Item item = bracketService.addItemToBracket(id, payload.getTitle(), payload.getMediaUrl(), payload.getMediaType());
        return ResponseEntity.ok(item);
    }
}
