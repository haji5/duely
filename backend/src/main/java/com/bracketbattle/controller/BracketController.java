package com.bracketbattle.controller;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.service.BracketService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:3000")
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
                .map(bracket -> ResponseEntity.ok(bracket))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/brackets/{id}/items")
    public ResponseEntity<List<Item>> getBracketItems(@PathVariable Long id) {
        List<Item> items = bracketService.getBracketItems(id);
        return ResponseEntity.ok(items);
    }

    @PostMapping("/brackets/{id}/results")
    public ResponseEntity<Result> saveBracketResult(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload) {

        String userId = (String) payload.get("userId");
        @SuppressWarnings("unchecked")
        List<Long> ranking = (List<Long>) payload.get("ranking");

        Result result = bracketService.saveBracketResult(id, userId, ranking);
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

    @PostMapping("/brackets")
    public ResponseEntity<Bracket> createBracket(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        String description = payload.get("description");
        String type = payload.get("type");

        Bracket bracket = bracketService.createBracket(name, description, type);
        return ResponseEntity.ok(bracket);
    }

    @PostMapping("/brackets/{id}/items")
    public ResponseEntity<Item> addItemToBracket(
            @PathVariable Long id,
            @RequestBody Map<String, String> payload) {

        String title = payload.get("title");
        String mediaUrl = payload.get("mediaUrl");
        String mediaType = payload.get("mediaType");

        Item item = bracketService.addItemToBracket(id, title, mediaUrl, mediaType);
        return ResponseEntity.ok(item);
    }
}
